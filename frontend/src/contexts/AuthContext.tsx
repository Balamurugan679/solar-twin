import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface User {
  username: string
  name?: string
  email?: string
}

interface AuthContextType {
  user: User | null
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  loading: boolean
  error: string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = () => {
      const savedUser = localStorage.getItem('solarTwinUser')
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser))
        } catch (e) {
          localStorage.removeItem('solarTwinUser')
        }
      }
      setLoading(false)
    }

    checkAuth()
  }, [])

  const login = async (username: string, password: string): Promise<boolean> => {
    setLoading(true)
    setError(null)

    try {
      // Simulate API call with demo credentials
      await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate network delay
      
      // Demo authentication - in real app, this would be an API call
      if (username === 'admin' && password === 'solar123') {
        const userData: User = {
          username,
          name: 'Solar Administrator',
          email: 'admin@solar-twin.com'
        }
        setUser(userData)
        localStorage.setItem('solarTwinUser', JSON.stringify(userData))
        return true
      } else if (username === 'user' && password === 'demo123') {
        const userData: User = {
          username,
          name: 'Demo User',
          email: 'user@solar-twin.com'
        }
        setUser(userData)
        localStorage.setItem('solarTwinUser', JSON.stringify(userData))
        return true
      } else {
        setError('Invalid username or password')
        return false
      }
    } catch (err) {
      setError('Login failed. Please try again.')
      return false
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('solarTwinUser')
  }

  const value = {
    user,
    login,
    logout,
    loading,
    error
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
