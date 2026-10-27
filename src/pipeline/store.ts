import type { Pool } from 'pg';

export type BusinessType = 'online_shop';
export type PlanId = 'basic' | 'medium' | 'premium';

export type Business = {
  id: string;
  name: string;
  businessType: BusinessType;
  plan: PlanId;
  aiEnabled: boolean;
  settings: Record<string, unknown>;
};

export type ActiveConnection = {
  connectionId: string;
  platform: string;
  externalAccountId: string;
  accessTokenEncrypted: string;
  business: Business;
};

export type Conversation = {
  id: string;
  businessId: string;
  customerId: string;
  platform: string;
  platformUserId: string;
  mode: 'ai' | 'human';
  state: Record<string, unknown>;
};

export type MessageDirection = 'in' | 'out';

export type HistoryMessage = {
  direction: MessageDirection;
  text: string | null;
  transcript: string | null;
};

export type OutboundRecord = {
  id: string;
  status: string | null;
  platformMessageId: string | null;
};

const toBusiness = (row: Record<string, unknown>): Business => ({
  id: String(row.business_id),
  name: String(row.name),
  businessType: row.business_type as BusinessType,
  plan: row.plan as PlanId,
  aiEnabled: Boolean(row.ai_enabled),
  settings: (row.settings ?? {}) as Record<string, unknown>,
});

/** All SQL used by the message pipeline. Keep queries here, not in the processor. */
export class PipelineStore {
  constructor(private readonly db: Pool) {}

  async recordWebhookEvent(eventKey: string, platform: string, payload: unknown): Promise<void> {
    await this.db.query(
      `INSERT INTO webhook_events (platform, event_key, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (event_key) DO NOTHING`,
      [platform, eventKey, JSON.stringify(payload)],
    );
  }

  async findActiveConnection(platform: string, externalAccountId: string): Promise<ActiveConnection | null> {
    const { rows } = await this.db.query(
      `SELECT cc.id AS connection_id, cc.platform, cc.external_account_id, cc.access_token_encrypted,
              b.id AS business_id, b.name, b.business_type, b.plan, b.ai_enabled, b.settings
       FROM channel_connections cc
       JOIN businesses b ON b.id = cc.business_id
       WHERE cc.platform = $1 AND cc.external_account_id = $2 AND cc.status = 'active'`,
      [platform, externalAccountId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      connectionId: String(row.connection_id),
      platform: String(row.platform),
      externalAccountId: String(row.external_account_id),
      accessTokenEncrypted: String(row.access_token_encrypted),
      business: toBusiness(row),
    };
  }

  async getOrCreateConversation(businessId: string, platform: string, platformUserId: string): Promise<Conversation> {
    const customer = await this.db.query<{ id: string }>(
      `INSERT INTO customers (business_id, platform, platform_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (business_id, platform, platform_user_id) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [businessId, platform, platformUserId],
    );
    const customerId = customer.rows[0].id;

    await this.db.query(
      `INSERT INTO conversations (business_id, customer_id) VALUES ($1, $2)
       ON CONFLICT (business_id, customer_id) DO NOTHING`,
      [businessId, customerId],
    );
    const { rows } = await this.db.query(
      `SELECT id, mode, state FROM conversations WHERE business_id = $1 AND customer_id = $2`,
      [businessId, customerId],
    );
    return {
      id: String(rows[0].id),
      businessId,
      customerId,
      platform,
      platformUserId,
      mode: rows[0].mode,
      state: rows[0].state ?? {},
    };
  }

  async setMode(conversationId: string, mode: 'ai' | 'human'): Promise<void> {
    await this.db.query(`UPDATE conversations SET mode = $2, updated_at = NOW() WHERE id = $1`, [conversationId, mode]);
  }

  async setConversationState(conversationId: string, state: Record<string, unknown>): Promise<void> {
    await this.db.query(
      `UPDATE conversations SET state = $2::jsonb, updated_at = NOW() WHERE id = $1`,
      [conversationId, JSON.stringify(state)],
    );
  }

  async touchInbound(conversationId: string, at: Date): Promise<void> {
    await this.db.query(
      `UPDATE conversations
       SET last_inbound_at = GREATEST(COALESCE(last_inbound_at, 'epoch'::timestamptz), $2), updated_at = NOW()
       WHERE id = $1`,
      [conversationId, at],
    );
  }

  /**
   * Stores an inbound message once per platform message id. Returns alreadyProcessed = true when
   * a previous attempt finished it, so redeliveries and retries stay idempotent.
   */
  async insertInbound(params: {
    businessId: string;
    conversationId: string;
    platformMessageId: string;
    contentType: 'text' | 'audio' | 'other';
    text: string | null;
    createdAt: Date;
  }): Promise<{ id: string; alreadyProcessed: boolean }> {
    const inserted = await this.db.query<{ id: string }>(
      `INSERT INTO messages (business_id, conversation_id, direction, platform_message_id, content_type, text, meta, created_at)
       VALUES ($1, $2, 'in', $3, $4, $5, '{"status":"received"}'::jsonb, $6)
       ON CONFLICT (platform_message_id) WHERE platform_message_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [params.businessId, params.conversationId, params.platformMessageId, params.contentType, params.text, params.createdAt],
    );
    if (inserted.rows[0]) return { id: String(inserted.rows[0].id), alreadyProcessed: false };

    const { rows } = await this.db.query(
      `SELECT id, meta FROM messages WHERE platform_message_id = $1`,
      [params.platformMessageId],
    );
    const existing = rows[0];
    return {
      id: String(existing.id),
      alreadyProcessed: existing.meta?.processed === true,
    };
  }

  async markProcessed(messageId: string, outcome: string, reason?: string): Promise<void> {
    await this.db.query(
      `UPDATE messages SET meta = meta || $2::jsonb WHERE id = $1`,
      [messageId, JSON.stringify({ processed: true, outcome, reason: reason ?? null })],
    );
  }

  async insertMessage(params: {
    businessId: string;
    conversationId: string;
    direction: MessageDirection;
    platformMessageId?: string | null;
    contentType?: 'text' | 'audio' | 'other';
    text?: string | null;
    handledBy?: 'bot' | 'human' | 'owner_app' | null;
    meta?: Record<string, unknown>;
  }): Promise<string> {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO messages (business_id, conversation_id, direction, platform_message_id, content_type, text, handled_by, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id`,
      [
        params.businessId,
        params.conversationId,
        params.direction,
        params.platformMessageId ?? null,
        params.contentType ?? 'text',
        params.text ?? null,
        params.handledBy ?? null,
        JSON.stringify(params.meta ?? {}),
      ],
    );
    return String(rows[0].id);
  }

  async updateMessage(
    messageId: string,
    patch: {
      platformMessageId?: string;
      transcript?: string;
      intent?: string;
      contentType?: 'text' | 'audio' | 'other';
      meta?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.db.query(
      `UPDATE messages SET
         platform_message_id = COALESCE($2, platform_message_id),
         transcript = COALESCE($3, transcript),
         intent = COALESCE($4, intent),
         content_type = COALESCE($5, content_type),
         meta = meta || $6::jsonb
       WHERE id = $1`,
      [
        messageId,
        patch.platformMessageId ?? null,
        patch.transcript ?? null,
        patch.intent ?? null,
        patch.contentType ?? null,
        JSON.stringify(patch.meta ?? {}),
      ],
    );
  }

  /** The stored message for a platform message id, if any (our own sends have their platform id here too). */
  async findMessageByPlatformId(businessId: string, platformMessageId: string): Promise<{ id: string; direction: MessageDirection } | null> {
    const { rows } = await this.db.query(
      `SELECT id, direction FROM messages WHERE business_id = $1 AND platform_message_id = $2`,
      [businessId, platformMessageId],
    );
    return rows[0] ? { id: String(rows[0].id), direction: rows[0].direction } : null;
  }

  /** Latest outbound record the bot made for one inbound message and purpose (reply or handoff notice). */
  async findOutboundForInbound(conversationId: string, inboundMid: string, kind: string): Promise<OutboundRecord | null> {
    const { rows } = await this.db.query(
      `SELECT id, meta->>'status' AS status, platform_message_id
       FROM messages
       WHERE conversation_id = $1 AND direction = 'out' AND meta->>'inMid' = $2 AND meta->>'kind' = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [conversationId, inboundMid, kind],
    );
    if (!rows[0]) return null;
    return {
      id: String(rows[0].id),
      status: rows[0].status,
      platformMessageId: rows[0].platform_message_id,
    };
  }

  async getRecentMessages(conversationId: string, limit: number, excludeMessageId: string): Promise<HistoryMessage[]> {
    const { rows } = await this.db.query(
      `SELECT direction, text, transcript FROM messages
       WHERE conversation_id = $1 AND id <> $3
       ORDER BY created_at DESC
       LIMIT $2`,
      [conversationId, limit, excludeMessageId],
    );
    return rows.reverse().map((row) => ({ direction: row.direction, text: row.text, transcript: row.transcript }));
  }

  /** Opens a handoff task unless one is already open for the same conversation and reason. */
  async openHandoffTask(businessId: string, conversationId: string, reason: string): Promise<void> {
    await this.db.query(
      `INSERT INTO handoff_tasks (business_id, conversation_id, reason)
       SELECT $1::uuid, $2::uuid, $3::varchar
       WHERE NOT EXISTS (
         SELECT 1 FROM handoff_tasks WHERE conversation_id = $2 AND reason = $3 AND status = 'open'
       )`,
      [businessId, conversationId, reason],
    );
  }

  async getUsage(businessId: string, period: string, kind: string): Promise<number> {
    const { rows } = await this.db.query(
      `SELECT count FROM usage_counters WHERE business_id = $1 AND period = $2 AND kind = $3`,
      [businessId, period, kind],
    );
    return rows[0] ? Number(rows[0].count) : 0;
  }

  async incrementUsage(businessId: string, period: string, kind: string): Promise<void> {
    await this.db.query(
      `INSERT INTO usage_counters (business_id, period, kind, count) VALUES ($1, $2, $3, 1)
       ON CONFLICT (business_id, period, kind) DO UPDATE SET count = usage_counters.count + 1`,
      [businessId, period, kind],
    );
  }

  /** Published products whose normalized name or an alias contains any of the terms. */
  async searchProducts(businessId: string, terms: string[], limit: number): Promise<Array<{ id: string; name: string }>> {
    const { rows } = await this.db.query(
      `SELECT p.id, p.name FROM products p
       WHERE p.business_id = $1 AND p.status = 'published'
         AND EXISTS (
           SELECT 1 FROM unnest($2::text[]) AS t
           WHERE strpos(p.name_normalized, t) > 0
              OR EXISTS (SELECT 1 FROM unnest(p.aliases) AS a WHERE strpos(lower(a), t) > 0)
         )
       ORDER BY p.name
       LIMIT $3`,
      [businessId, terms, limit],
    );
    return rows.map((row) => ({ id: String(row.id), name: String(row.name) }));
  }

  async getVariants(productIds: string[]): Promise<Array<{ productId: string; attributes: Record<string, string>; priceToman: number; stockQuantity: number }>> {
    if (productIds.length === 0) return [];
    const { rows } = await this.db.query(
      `SELECT product_id, attributes, price_toman, stock_quantity FROM product_variants
       WHERE product_id = ANY($1::uuid[])
       ORDER BY price_toman, created_at`,
      [productIds],
    );
    return rows.map((row) => ({
      productId: String(row.product_id),
      attributes: row.attributes ?? {},
      priceToman: Number(row.price_toman),
      stockQuantity: Number(row.stock_quantity),
    }));
  }

  async findOrder(businessId: string, orderCode: string, phone: string): Promise<{
    orderCode: string;
    status: string;
    trackingCode: string | null;
    carrier: string | null;
    totalToman: number;
  } | null> {
    const { rows } = await this.db.query(
      `SELECT order_code, status, tracking_code, carrier, total_toman FROM orders
       WHERE business_id = $1 AND UPPER(order_code) = UPPER($2) AND customer_phone = $3`,
      [businessId, orderCode, phone],
    );
    if (!rows[0]) return null;
    return {
      orderCode: String(rows[0].order_code),
      status: String(rows[0].status),
      trackingCode: rows[0].tracking_code,
      carrier: rows[0].carrier,
      totalToman: Number(rows[0].total_toman),
    };
  }
}
