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

  // Badge system with actual badge images
  const rankBadges = [
    { 
      name: 'Alert Ninja', 
      image: '/badges/alert ninja.jpeg', 
      earned: true, 
      date: '2024-01-15',
      description: 'Master of system alerts and monitoring'
    },
    { 
      name: 'Carbon Cutter', 
      image: '/badges/carbon cutter.jpeg', 
      earned: true, 
      date: '2024-02-01',
      description: 'Reduced carbon emissions significantly'
    },
    { 
      name: 'Forecast Pro', 
      image: '/badges/forecast pro.jpeg', 
      earned: true, 
      date: '2024-02-20',
      description: 'Expert at energy forecasting and prediction'
    },
    { 
      name: 'Sunny Streak', 
      image: '/badges/sunny streek.jpeg', 
      earned: userStats.daysActive >= 100, 
      date: userStats.daysActive >= 100 ? '2024-05-15' : null,
      description: 'Maintained consistent solar generation streak'
    },
    { 
      name: 'Solar Champion', 
      image: null, 
      earned: false, 
      date: null,
      description: 'Generate over 2000 kWh of solar energy'
    },
    { 
      name: 'Green Legend', 
      image: null, 
      earned: false, 
      date: null,
      description: 'Save over 5000 kg of CO₂ emissions'
    }
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

              {/* Achievement Badges */}
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Achievements</h3>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {rankBadges.map((badge, index) => (
                  <div
                    key={index}
                    className={`group relative p-2 rounded-lg border-2 h-20 flex flex-col items-center justify-center transition-all duration-200 cursor-pointer ${
                      badge.earned
                        ? 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-300 shadow-md hover:shadow-lg transform hover:scale-105'
                        : 'bg-gray-50 border-gray-200 opacity-50'
                    }`}
                    title={badge.description + (badge.earned && badge.date ? ` (Earned: ${badge.date})` : '')}
                  >
                    {badge.earned && badge.image ? (
                      <>
                        <img
                          src={badge.image}
                          alt={badge.name}
                          className="w-10 h-10 rounded-full object-cover mb-1 group-hover:scale-110 transition-transform duration-200"
                        />
                        <span className="text-xs font-medium text-gray-700 text-center leading-tight">
                          {badge.name}
                        </span>
                        {/* Earned indicator */}
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-sm">
                          <span className="text-white text-xs font-bold">✓</span>
                        </div>
                        {/* Earned date tooltip */}
                        {badge.date && (
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                            Earned: {badge.date}
                          </div>
                        )}
                      </>
                    ) : badge.earned && !badge.image ? (
                      <>
                        <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mb-1 group-hover:scale-110 transition-transform duration-200">
                          <span className="text-white text-lg font-bold">★</span>
                        </div>
                        <span className="text-xs font-medium text-gray-700 text-center leading-tight">
                          {badge.name}
                        </span>
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-sm">
                          <span className="text-white text-xs font-bold">✓</span>
                        </div>
                        {badge.date && (
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                            Earned: {badge.date}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center mb-1">
                          <span className="text-gray-500 text-lg">🔒</span>
                        </div>
                        <span className="text-xs text-gray-500 text-center leading-tight">
                          {badge.name}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Achievement Stats */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">Badges Earned</span>
                  <span className="text-sm font-medium text-gray-900">
                    {rankBadges.filter(badge => badge.earned).length} / {rankBadges.length}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-yellow-400 to-orange-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(rankBadges.filter(badge => badge.earned).length / rankBadges.length) * 100}%` }}
                  ></div>
                </div>
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
