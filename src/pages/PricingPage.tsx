import { useEffect } from 'react'
import { stripeProducts } from '../stripe-config'
import { useSubscription } from '../hooks/useSubscription'
import { ProductCard } from '../components/ProductCard'
import { trackViewContent } from '../lib/ownerMetaPixel'
import { trackMetaEvent } from '../lib/metaTrack'

export function PricingPage() {
  const { getActiveProduct } = useSubscription()
  const activeProduct = getActiveProduct()

  useEffect(() => {
    // Track pricing page view (existing pixel tracking)
    trackViewContent('Pricing');

    // Track ViewContent via Pixel + CAPI
    trackMetaEvent('ViewContent', {
      customData: {
        content_name: 'Ghoste Pricing Page',
        content_category: 'Pricing',
      },
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Choose Your Plan
          </h2>
          <p className="mt-4 text-xl text-gray-600">
            Select the perfect plan for your needs
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-3 lg:gap-x-8">
          {stripeProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              isActive={activeProduct?.id === product.id}
            />
          ))}
        </div>
      </div>
    </div>
  )
}