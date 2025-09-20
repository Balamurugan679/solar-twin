import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function Header() {
  const { user, logout } = useAuth()
  const [showProfileCard, setShowProfileCard] = useState(false)

  // Calculate user rank based on dummy power generation data
  const calculateUserRank = (totalPowerGenerated: number = 1250) => {
    if (totalPowerGenerated >= 2000) return { rank: 'Solar Master', level: 'gold', icon: '🏆' }
    if (totalPowerGenerated >= 1000) return { rank: 'Energy Expert', level: 'silver', icon: '⚡' }
    if (totalPowerGenerated >= 500) return { rank: 'Green Pioneer', level: 'bronze', icon: '🌱' }
    return { rank: 'Solar Starter', level: 'beginner', icon: '☀️' }
  }

  const userStats = {
    totalPowerGenerated: 1250, // kWh
    carbonSaved: 1025, // kg CO2
    treesEquivalent: 46,
    daysActive: 127,
    efficiency: 87.5 // %
  }

  const userRank = calculateUserRank(userStats.totalPowerGenerated)

  // Dummy rank badges
  const rankBadges = [
    { name: 'First Week', icon: '🎯', earned: true, date: '2024-01-15' },
    { name: 'Eco Warrior', icon: '🌍', earned: true, date: '2024-02-01' },
    { name: 'Power Saver', icon: '💡', earned: true, date: '2024-02-20' },
    { name: 'Carbon Crusher', icon: '🌿', earned: false, date: null },
    { name: 'Solar Champion', icon: '👑', earned: false, date: null },
    { name: 'Green Legend', icon: '🌟', earned: false, date: null }
  ]

  return (
    <>
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <div className="h-8 w-8 bg-indigo-600 rounded-full flex items-center justify-center">
                  <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h1 className="ml-3 text-xl font-semibold text-gray-900">Solar Twin Dashboard</h1>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-700">
                Welcome, <span className="font-medium">{user?.name || user?.username}</span>
              </div>
              
              {/* Profile Image Button */}
              <button
                onClick={() => setShowProfileCard(true)}
                className="relative h-10 w-10 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-white font-semibold text-sm hover:from-indigo-600 hover:to-purple-600 transition-all duration-200 shadow-md hover:shadow-lg"
              >
                {(user?.name || user?.username || 'U').charAt(0).toUpperCase()}
                
                {/* Rank indicator */}
                <div className="absolute -top-1 -right-1 h-4 w-4 bg-white rounded-full flex items-center justify-center shadow-sm">
                  <span className="text-xs">{userRank.icon}</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Profile Card Overlay */}
      {showProfileCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setShowProfileCard(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="relative bg-gradient-to-r from-indigo-500 to-purple-500 text-white p-6 rounded-t-xl">
              <button
                onClick={() => setShowProfileCard(false)}
                className="absolute top-4 right-4 text-white hover:text-gray-200 transition-colors"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <div className="flex items-center space-x-4">
                <div className="h-16 w-16 rounded-full bg-white bg-opacity-20 flex items-center justify-center text-2xl font-bold">
                  {(user?.name || user?.username || 'User').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-bold">{user?.name || user?.username || 'Solar User'}</h2>
                  <p className="text-indigo-100">{user?.email || 'user@solartwin.com'}</p>
                  <div className="flex items-center mt-1">
                    <span className="text-lg mr-1">{userRank.icon}</span>
                    <span className="text-sm font-medium">{userRank.rank}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* User Stats */}
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Impact</h3>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-green-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{userStats.totalPowerGenerated}</div>
                  <div className="text-sm text-gray-600">kWh Generated</div>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{userStats.carbonSaved}</div>
                  <div className="text-sm text-gray-600">kg CO₂ Saved</div>
                </div>
                <div className="bg-orange-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{userStats.treesEquivalent}</div>
                  <div className="text-sm text-gray-600">Trees Equivalent</div>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{userStats.efficiency}%</div>
                  <div className="text-sm text-gray-600">Efficiency</div>
                </div>
              </div>

              {/* Rank Badges */}
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Achievements</h3>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {Array.from({ length: 6 }, (_, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-lg bg-gray-50 border-2 border-gray-200 h-16 flex items-center justify-center"
                  >
                    {/* Empty dummy card */}
                  </div>
                ))}
              </div>

              {/* Account Info */}
              <div className="border-t pt-4 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Account Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Member since:</span>
                    <span className="font-medium">January 15, 2024</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Days active:</span>
                    <span className="font-medium">{userStats.daysActive} days</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Phone:</span>
                    <span className="font-medium">+1 (555) 123-4567</span>
                  </div>
                </div>
              </div>

              {/* Logout Button */}
              <button
                onClick={() => {
                  setShowProfileCard(false)
                  logout()
                }}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
