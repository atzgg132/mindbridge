import { useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { authApi } from '../api/auth'
import { motion } from 'framer-motion'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, token, user, setAuth, setLoading, isLoading } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    const verifyAuth = async () => {
      if (token && !user) {
        try {
          const userData = await authApi.getMe()
          setAuth(userData, token)
        } catch (error) {
          useAuthStore.getState().logout()
          navigate('/signin')
        } finally {
          setLoading(false)
        }
      } else {
        setLoading(false)
      }
    }

    verifyAuth()
  }, [token, user, setAuth, setLoading, navigate])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="animate-spin h-12 w-12 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading...</p>
        </motion.div>
      </div>
    )
  }

  if (!isAuthenticated || !token) {
    return <Navigate to="/signin" replace />
  }

  return <>{children}</>
}
