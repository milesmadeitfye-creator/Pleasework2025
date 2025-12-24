export interface StripeProduct {
  id: string;
  priceId: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  mode: 'payment' | 'subscription';
}

export const stripeProducts: StripeProduct[] = [
  {
    id: 'prod_TdmPDs1lyUheBP',
    priceId: 'price_1SgUqVCmFCKCWOjbbxxxxuQI',
    name: 'Power Refill',
    price: 39.99,
    currency: 'usd',
    mode: 'payment'
  },
  {
    id: 'prod_TdmN4cGXtsHoDr',
    priceId: 'price_1SgUoNCmFCKCWOjbto3bOIHT',
    name: 'Growth Refill (25,000 Credits)',
    description: 'Add 25,000 credits to your Ghoste One wallet. Ideal for ongoing campaigns and regular content creation.',
    price: 24.99,
    currency: 'usd',
    mode: 'payment'
  },
  {
    id: 'prod_TdmKte3EMHdJXe',
    priceId: 'price_1SgUlSCmFCKCWOjbAfOxGy3o',
    name: 'Starter Pack (10,000 Credits)',
    description: 'Perfect for quick tasks and light campaigns. Top up when you need a little extra fuel.',
    price: 9.99,
    currency: 'usd',
    mode: 'payment'
  },
  {
    id: 'prod_TdlAvClGJ4pMxM',
    priceId: 'price_1SgTeQCmFCKCWOjbmfh2R3PQ',
    name: 'Label',
    description: 'Built for labels, managers, and serious operators. Unlimited tools with fair-use access, advanced automation, and full control over campaigns, content, and growth — all from one platform.',
    price: 99.00,
    currency: 'usd',
    mode: 'subscription'
  },
  {
    id: 'prod_Tdl569B0DBgS6l',
    priceId: 'price_1SgTZeCmFCKCWOjbIlDnsfaZ',
    name: 'Operator',
    description: 'Built for artists ready to scale. Launch smarter campaigns, automate your rollout, and turn real data into momentum — all from one hub.',
    price: 59.00,
    currency: 'usd',
    mode: 'subscription'
  },
  {
    id: 'prod_TdA2FUTZfFMTXG',
    priceId: 'price_1SftirCmFCKCWOjbUzFOXbel',
    name: 'Starter',
    description: 'Everything you need to run your music like a business. Smart links, planning tools, and performance tracking — plus monthly credits for creative tools and automation.',
    price: 29.00,
    currency: 'usd',
    mode: 'subscription'
  }
];

export const getProductsByMode = (mode: 'payment' | 'subscription') => {
  return stripeProducts.filter(product => product.mode === mode);
};

export const getProductByPriceId = (priceId: string) => {
  return stripeProducts.find(product => product.priceId === priceId);
};