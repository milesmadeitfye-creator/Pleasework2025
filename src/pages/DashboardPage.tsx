import { useSubscription } from '../hooks/useSubscription'
import { useAuth } from '../hooks/useAuth'
import { Crown, Calendar, CreditCard, AlertCircle } from 'lucide-react'

export function DashboardPage() {
  const { user } = useAuth()
  const { subscription, loading, getActiveProduct, isActive } = useSubscription()
  
  const activeProduct = getActiveProduct()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">Welcome back, {user?.email}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Subscription Status Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Crown className="h-8 w-8 text-indigo-600" />
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">Subscription Status</h3>
                <p className={`text-sm ${isActive() ? 'text-green-600' : 'text-gray-500'}`}>
                  {isActive() ? 'Active' : 'No active subscription'}
                </p>
              </div>
            </div>
            
            {activeProduct && (
              <div className="mt-4">
                <p className="text-sm text-gray-600">Current Plan:</p>
                <p className="font-medium text-gray-900">{activeProduct.name}</p>
              </div>
            )}
          </div>

          {/* Billing Period Card */}
          {subscription?.current_period_end && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <Calendar className="h-8 w-8 text-indigo-600" />
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900">Billing Period</h3>
                  <p className="text-sm text-gray-500">
                    Renews on {new Date(subscription.current_period_end * 1000).toLocaleDateString()}
                  </p>
                </div>
              </div>
              
              {subscription.cancel_at_period_end && (
                <div className="mt-4 flex items-center text-amber-600">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  <span className="text-sm">Subscription will cancel at period end</span>
                </div>
              )}
            </div>
          )}

          {/* Payment Method Card */}
          {subscription?.payment_method_brand && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <CreditCard className="h-8 w-8 text-indigo-600" />
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900">Payment Method</h3>
                  <p className="text-sm text-gray-500">
                    {subscription.payment_method_brand.toUpperCase()} ending in {subscription.payment_method_last4}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {!isActive() && (
          <div className="mt-8 bg-white rounded-lg shadow p-6">
            <div className="text-center">
              <Crown className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">No Active Subscription</h3>
              <p className="mt-2 text-gray-600">
                Subscribe to unlock premium features and get the most out of our platform.
              </p>
              <div className="mt-6">
                <a
                  href="/pricing"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  View Plans
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}