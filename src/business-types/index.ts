import { onlineShopModule } from './online-shop';
import type { BusinessType, BusinessTypeModule } from './types';

// Registry: adding a business type means adding its module here. V1 registers online_shop only.
const REGISTRY: Record<BusinessType, BusinessTypeModule> = {
  online_shop: onlineShopModule,
};

export const getBusinessTypeModule = (businessType: BusinessType): BusinessTypeModule => {
  const module = REGISTRY[businessType];
  if (!module) throw new Error(`No business type module for "${businessType}"`);
  return module;
};

export type { BusinessType, BusinessTypeModule, RetrievalContext, RetrievalResult } from './types';
