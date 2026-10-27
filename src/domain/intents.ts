// Intent registry. Intents are data, not code: each business type registers its own list.
// V1 registers 'online_shop' only. Adding a business type means adding an entry here.

export type IntentRoute = 'answer' | 'handoff' | 'ignore';

export type HandlerName =
  | 'none'
  | 'product_lookup'
  | 'store_info'
  | 'shipping'
  | 'payment'
  | 'return_policy'
  | 'discount'
  | 'order_status'
  | 'purchase'
  | 'faq';

export type IntentDefinition = {
  id: string;
  /** Shown to the judgement engine. Keep it concrete and in Persian, with a Finglish example. */
  description: string;
  route: IntentRoute;
  handler: HandlerName;
};

export const ONLINE_SHOP_INTENTS: readonly IntentDefinition[] = [
  { id: 'greeting', description: 'سلام، احوال‌پرسی یا شروع گفتگو (مثلا: سلام، salam)', route: 'answer', handler: 'none' },
  { id: 'thanks_or_goodbye', description: 'تشکر یا خداحافظی (مثلا: ممنون، merci، bye)', route: 'answer', handler: 'none' },
  { id: 'store_info', description: 'ساعت کاری، آدرس، شماره تماس یا اطلاعات کلی فروشگاه', route: 'answer', handler: 'store_info' },
  { id: 'product_search', description: 'پرسیدن اینکه محصولی دارید یا نه (مثلا: شلوار جین دارید؟، dari?)', route: 'answer', handler: 'product_lookup' },
  { id: 'product_price', description: 'پرسیدن قیمت یک محصول (مثلا: قیمت این شلوار چنده؟)', route: 'answer', handler: 'product_lookup' },
  { id: 'product_availability', description: 'پرسیدن موجودی یک رنگ یا سایز (مثلا: مشکی سایز M دارید؟)', route: 'answer', handler: 'product_lookup' },
  { id: 'product_details', description: 'پرسیدن جزئیات محصول: جنس، ابعاد، توضیحات', route: 'answer', handler: 'product_lookup' },
  { id: 'shipping_info', description: 'پرسیدن هزینه، زمان یا مناطق ارسال', route: 'answer', handler: 'shipping' },
  { id: 'payment_methods', description: 'پرسیدن روش‌های پرداخت (مثلا: کارت به کارت، پرداخت درب منزل)', route: 'answer', handler: 'payment' },
  { id: 'order_status', description: 'پیگیری سفارش یا مرسوله (مثلا: سفارشم کجاست؟)', route: 'answer', handler: 'order_status' },
  { id: 'purchase_intent', description: 'می‌خواهم خرید کنم یا سفارش بدهم (مثلا: میخوام بخرم)', route: 'answer', handler: 'purchase' },
  { id: 'return_policy', description: 'سوال کلی درباره شرایط بازگشت یا تعویض کالا', route: 'answer', handler: 'return_policy' },
  { id: 'discount_info', description: 'سوال درباره تخفیف یا کد تخفیف', route: 'answer', handler: 'discount' },
  { id: 'faq_other', description: 'سوال عمومی دیگر درباره فروشگاه', route: 'answer', handler: 'faq' },

  // Handoff: a person must decide or act.
  { id: 'human_request', description: 'درخواست صحبت با انسان یا پشتیبان', route: 'handoff', handler: 'none' },
  { id: 'complaint', description: 'شکایت، ناراضی بودن یا توهین', route: 'handoff', handler: 'none' },
  { id: 'refund_or_return_request', description: 'درخواست واقعی برای مرجوعی، تعویض یا استرداد وجه', route: 'handoff', handler: 'none' },
  { id: 'order_change_or_cancel', description: 'تغییر آدرس، لغو یا ویرایش سفارش ثبت‌شده', route: 'handoff', handler: 'none' },
  { id: 'price_negotiation', description: 'چانه‌زنی یا درخواست تخفیف خاص', route: 'handoff', handler: 'none' },
  { id: 'custom_order', description: 'سفارش ساخت خاص یا محصول سفارشی', route: 'handoff', handler: 'none' },
  { id: 'media_message', description: 'عکس، ویدیو یا فایل فرستاده شده', route: 'handoff', handler: 'none' },
  { id: 'unknown', description: 'پیام نامفهوم یا خارج از موضوع فروشگاه', route: 'handoff', handler: 'none' },

  // Ignore: no reply, no task.
  { id: 'spam', description: 'تبلیغ، پیام انبوه یا ربات دیگر', route: 'ignore', handler: 'none' },
];

export type BusinessTypeId = 'online_shop';

export const BUSINESS_TYPE_REGISTRY: Record<BusinessTypeId, readonly IntentDefinition[]> = {
  online_shop: ONLINE_SHOP_INTENTS,
};

export const getIntents = (businessType: BusinessTypeId): readonly IntentDefinition[] =>
  BUSINESS_TYPE_REGISTRY[businessType];

export const findIntent = (
  businessType: BusinessTypeId,
  intentId: string,
): IntentDefinition | undefined => getIntents(businessType).find((intent) => intent.id === intentId);
