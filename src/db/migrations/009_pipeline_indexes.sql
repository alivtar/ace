-- The pipeline finds a bot reply by the inbound message it answers, so that retries never send twice.
CREATE INDEX messages_outbound_in_mid_idx
    ON messages ((meta->>'inMid'), (meta->>'kind'))
    WHERE direction = 'out';
