import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { CheckCircle, ArrowRight, Sparkles } from 'lucide-react'
import { trackSubscribe } from '../lib/ownerMetaPixel'

export function SuccessPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  useEffect(() => {
    // Track successful Pro subscription
    trackSubscribe('Ghoste Pro Monthly', 19); // Adjust price if needed

    const timer = setTimeout(() => {
      navigate('/dashboard')
    }, 3000)

    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <CheckCircle className="h-20 w-20 text-green-500" />
              <Sparkles className="h-8 w-8 text-yellow-400 absolute -top-2 -right-2 animate-pulse" />
            </div>
          </div>
          <h2 className="mt-6 text-4xl font-extrabold text-white">
            Welcome to Pro!
          </h2>
          <p className="mt-4 text-lg text-gray-300">
            Your payment was successful. You now have access to all Pro features.
          </p>
          <div className="mt-6 p-4 bg-gray-900 rounded-lg border border-gray-700">
            <p className="text-sm text-green-400 font-medium">Pro Account Activated</p>
            <p className="text-xs text-gray-400 mt-1">Redirecting to dashboard in 3 seconds...</p>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="group relative w-full flex justify-center items-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Go to Dashboard Now
            <ArrowRight className="ml-2 h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}