import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar'
import io from 'socket.io-client'
import api from '../lib/api'

type ChatView = 'circle' | 'instant-help'

interface Message {
  id: string
  circleId: string
  senderId: string
  senderName: string
  senderAvatar?: string | null
  content: string
  imageUrl?: string | null
  createdAt: string
  readBy: string[]
}

interface CircleMember {
  id: string
  fullName: string
  profilePicture?: string | null
  isModerator: boolean
}

interface CircleInfo {
  circleId: string
  circleName: string
  category: string
  memberCount: number
  status: string
}

interface OutgoingMessagePayload {
  circleId: string
  content: string
  imageUrl?: string
  timestamp: number
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export default function Dashboard() {
  console.log('🎯 Dashboard component rendering')

  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [activeView, setActiveView] = useState<ChatView>('circle')
  const [messageInput, setMessageInput] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [circleMembers, setCircleMembers] = useState<CircleMember[]>([])
  const [circleInfo, setCircleInfo] = useState<CircleInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [hasNoCircle, setHasNoCircle] = useState(false)
  const [isSocketReady, setIsSocketReady] = useState(false)

  const socketRef = useRef<any>(null)
  const pendingMessagesRef = useRef<OutgoingMessagePayload[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  console.log('📊 Current state:', { user, circleInfo, hasNoCircle, isLoading })

  useEffect(() => {
    console.log('🔄 useEffect running')
    const token = localStorage.getItem('auth_token')
    console.log('🔑 Token exists:', !!token)
    console.log('👤 User exists:', !!user)

    if (!token || !user) {
      console.log('❌ No token or user, redirecting to signin')
      navigate('/signin')
      return
    }

    // Fetch circle info
    const fetchCircleInfo = async () => {
      console.log('🔍 Fetching circle info...')
      try {
        const response = await api.get('/messages/my-circle')
        console.log('✅ Circle info received:', response.data)
        setCircleInfo(response.data)
        setHasNoCircle(false)

        // Fetch messages and members
        await fetchMessagesAndMembers(response.data.circleId)

        // Initialize Socket.io
        console.log('🔌 Initializing socket for circle:', response.data.circleId)
        initializeSocket(response.data.circleId)
      } catch (error: any) {
        if (error.response?.status === 404) {
          console.log('⚠️ No circle found for user yet')
        } else {
          console.error('❌ Error fetching circle:', error.response?.status || error.message)
        }
        setHasNoCircle(true)
      } finally {
        setIsLoading(false)
      }
    }

    fetchCircleInfo()

    return () => {
      console.log('🧹 Cleanup: disconnecting socket')
      if (socketRef.current) {
        socketRef.current.removeAllListeners?.()
        socketRef.current.disconnect()
      }
      setIsSocketReady(false)
      pendingMessagesRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const flushPendingMessages = () => {
    if (!socketRef.current) {
      return
    }

    const queued = pendingMessagesRef.current
    if (!queued.length) {
      return
    }

    console.log(`📨 Flushing ${queued.length} queued message(s)`)
    queued.forEach((payload) => {
      socketRef.current.emit('send_message', JSON.stringify(payload))
    })
    pendingMessagesRef.current = []
  }

  const fetchMessagesAndMembers = async (circleId: string) => {
    try {
      const [messagesResponse, membersResponse] = await Promise.all([
        api.get(`/messages/circle/${circleId}`),
        api.get(`/messages/circle/${circleId}/members`),
      ])

      const messagesData = messagesResponse.data
      setMessages(messagesData)

      // Mark messages as read
      messagesData.forEach((msg: Message) => {
        if (msg.senderId !== user?.id && !msg.readBy.includes(user?.id || '')) {
          markMessageAsRead(msg.id, circleId)
        }
      })

      const membersData = membersResponse.data
      setCircleMembers(membersData.members)
    } catch (error) {
      console.error('Failed to fetch messages and members:', error)
    }
  }

  const initializeSocket = (circleId: string) => {
    console.log('⚡ initializeSocket called with circleId:', circleId)
    const token = localStorage.getItem('auth_token')
    console.log('🔑 Token for socket:', token ? 'exists' : 'missing')
    console.log('🌐 API_URL:', API_URL)

    if (socketRef.current) {
      console.log('♻️ Existing socket found, disconnecting before reinitializing')
      socketRef.current.removeAllListeners?.()
      socketRef.current.disconnect()
      setIsSocketReady(false)
    }

    console.log('🔌 Creating socket instance...')
    const socket = io(API_URL, {
      transports: ['polling', 'websocket'],
      withCredentials: true,
    })

    console.log('📡 Socket instance created, setting up listeners...')
    setIsSocketReady(false)

    socket.on('connect', () => {
      console.log('✅ Socket connected with ID:', socket.id)
      setIsSocketReady(false)
      // Authenticate
      if (token) {
        console.log('🔐 Sending authenticate event with token...')
        socket.emit('authenticate', token)
      } else {
        console.log('❌ No token available for authentication')
      }
    })

    socket.on('auth_success', (data) => {
      console.log('🎉 Authentication successful! Data:', data)
      setIsSocketReady(true)
      flushPendingMessages()
    })

    socket.on('auth_error', (error) => {
      console.error('❌ Authentication failed:', error)
      setIsSocketReady(false)
    })

    socket.on('message_error', (error) => {
      console.error('❌ Message error:', error)
    })

    socket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error)
      setIsSocketReady(false)
    })

    socket.on('new_message', (message: Message) => {
      console.log('📨 New message received:', message)
      setMessages((prev) => [...prev, message])

      // Mark as read if not from current user
      if (message.senderId !== user?.id) {
        markMessageAsRead(message.id, circleId)
      }

      // Scroll to bottom
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    })

    socket.on('message_read', (data: { messageId: string; userId: string; readBy: string[] }) => {
      console.log('👁️ Message read update:', data)
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === data.messageId ? { ...msg, readBy: data.readBy } : msg
        )
      )
    })

    socket.on('disconnect', () => {
      console.log('🔴 Socket disconnected')
      setIsSocketReady(false)
    })

    console.log('💾 Storing socket in ref')
    socketRef.current = socket
    console.log('✅ Socket setup complete!')
  }

  const markMessageAsRead = (messageId: string, circleId: string) => {
    if (socketRef.current && isSocketReady) {
      socketRef.current.emit('mark_read', JSON.stringify({
        messageId,
        circleId,
      }))
    }
  }

  const handleSendMessage = async () => {
    console.log('🚀 handleSendMessage called')
    console.log('📝 messageInput:', messageInput)
    console.log('🔵 circleInfo:', circleInfo)
    console.log('🔌 socketRef.current:', socketRef.current)
    console.log('✅ Socket authenticated:', isSocketReady)

    if (!messageInput.trim()) {
      console.log('❌ Message input is empty')
      return
    }

    if (!circleInfo) {
      console.log('❌ Circle info is null')
      return
    }

    const payload: OutgoingMessagePayload = {
      circleId: circleInfo.circleId,
      content: messageInput.trim(),
      imageUrl: '',
      timestamp: Date.now(),
    }

    if (!socketRef.current) {
      console.log('⚠️ Socket missing, queueing message and re-initializing')
      pendingMessagesRef.current.push(payload)
      initializeSocket(circleInfo.circleId)
      setMessageInput('')
      return
    }

    if (!isSocketReady) {
      console.log('⏳ Socket not authenticated yet, queueing message')
      pendingMessagesRef.current.push(payload)
      setMessageInput('')
      return
    }

    console.log('📤 Sending message:', payload)
    socketRef.current.emit('send_message', JSON.stringify(payload))
    console.log('✅ Message emitted')
    setMessageInput('')
  }

  const handleImageUpload = async (file: File) => {
    if (!file || !circleInfo) return

    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('image', file)

      const response = await api.post('/messages/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      // Send message with image
      const payload = {
        circleId: circleInfo.circleId,
        content: messageInput.trim() || '📷 Image',
        imageUrl: response.data.imageUrl,
        timestamp: Date.now(),
      }

      if (!socketRef.current) {
        console.log('⚠️ Socket missing during image upload, queueing message and re-initializing')
        pendingMessagesRef.current.push(payload)
        initializeSocket(circleInfo.circleId)
      } else if (!isSocketReady) {
        console.log('⏳ Socket not authenticated yet, queueing image message')
        pendingMessagesRef.current.push(payload)
      } else {
        socketRef.current.emit('send_message', JSON.stringify(payload))
      }
      setMessageInput('')
    } catch (error) {
      console.error('Image upload error:', error)
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleImageUpload(file)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleLogout = () => {
    if (socketRef.current) {
      socketRef.current.disconnect()
    }
    logout()
    navigate('/signin')
  }

  const getReadReceiptIcon = (message: Message) => {
    if (message.senderId !== user?.id) return null

    const isRead = message.readBy.length > 1 // More than just the sender

    if (isRead) {
      // Green tick - message has been read
      return (
        <svg className="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )
    } else {
      // Grey tick - message sent but not read
      return (
        <svg className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading your circle...</p>
        </div>
      </div>
    )
  }

  if (hasNoCircle) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-8">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mx-auto mb-6">
            <svg className="h-10 w-10 text-indigo-600 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-3">
            Finding Your Circle...
          </h2>
          <p className="text-slate-600 mb-6">
            We're matching you with a support circle based on your needs and preferences. This usually takes just a few moments.
          </p>
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-slate-200/50">
            <p className="text-sm text-slate-700 mb-4">
              <strong>What's happening:</strong>
            </p>
            <ul className="text-sm text-slate-600 space-y-2 text-left">
              <li className="flex items-start gap-2">
                <span className="text-indigo-600 mt-0.5">✓</span>
                <span>Analyzing your topics and needs</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-600 mt-0.5">✓</span>
                <span>Finding peers with similar experiences</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-0.5 animate-pulse">⟳</span>
                <span>Assigning a trained moderator</span>
              </li>
            </ul>
          </div>
          <p className="text-xs text-slate-500 mt-6">
            Please refresh this page in a few moments, or contact support if this persists.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium hover:shadow-lg transition-all"
          >
            Refresh
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: 'spring', damping: 25 }}
            className="w-80 bg-white/80 backdrop-blur-lg border-r border-slate-200/50 flex flex-col shadow-lg"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-200/50">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  MindBridge
                </h1>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="lg:hidden p-2 hover:bg-slate-100 rounded-lg transition"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* User Profile */}
              <div className="mt-6 flex items-center gap-3">
                <Avatar
                  name={user?.fullName || ''}
                  profilePicture={user?.profilePicture}
                  size="md"
                  className="ring-2 ring-indigo-500/20"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{user?.fullName}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-2">
              <button
                onClick={() => setActiveView('circle')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  activeView === 'circle'
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="font-medium">My Circle</span>
              </button>

              <button
                onClick={() => setActiveView('instant-help')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  activeView === 'instant-help'
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="font-medium">Instant Help</span>
              </button>
            </nav>

            {/* Circle Members */}
            {activeView === 'circle' && circleMembers.length > 0 && (
              <div className="border-t border-slate-200/50 p-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  Circle Members ({circleMembers.length})
                </h3>
                <div className="space-y-2">
                  {circleMembers.map((member) => (
                    <div key={member.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition">
                      <Avatar name={member.fullName} profilePicture={member.profilePicture} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{member.fullName}</p>
                        {member.isModerator && (
                          <span className="inline-flex items-center gap-1 text-xs text-indigo-600">
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            Moderator
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Logout Button */}
            <div className="p-4 border-t border-slate-200/50">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-slate-700 hover:bg-slate-100 transition-all"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="font-medium">Logout</span>
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200/50 px-6 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {!isSidebarOpen && (
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition"
                >
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              )}
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {activeView === 'circle' ? (circleInfo?.circleName || 'My Circle') : 'Instant Help'}
                </h2>
                <p className="text-sm text-slate-600">
                  {activeView === 'circle'
                    ? 'Connect with your support group'
                    : '24/7 AI-powered support'}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeView === 'circle' && (
            <AnimatePresence mode="popLayout">
              {messages.map((message, index) => {
                const isCurrentUser = message.senderId === user?.id
                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ delay: index * 0.02 }}
                    className={`flex gap-3 ${isCurrentUser ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    <Avatar
                      name={message.senderName}
                      profilePicture={message.senderAvatar}
                      size="sm"
                      className="flex-shrink-0"
                    />
                    <div className={`flex flex-col gap-1 max-w-md ${isCurrentUser ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-700">
                          {message.senderName}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div
                        className={`px-4 py-2.5 rounded-2xl ${
                          isCurrentUser
                            ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                            : 'bg-white text-slate-900 shadow-sm border border-slate-200'
                        }`}
                      >
                        <p className="text-sm leading-relaxed">{message.content}</p>
                        {message.imageUrl && (
                          <img
                            src={`${API_URL}${message.imageUrl}`}
                            alt="Uploaded"
                            className="mt-2 rounded-lg max-w-xs"
                          />
                        )}
                      </div>
                      {isCurrentUser && (
                        <div className="flex items-center gap-1">
                          {getReadReceiptIcon(message)}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          )}

          {activeView === 'instant-help' && (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mb-4">
                <svg className="h-10 w-10 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                24/7 Support Available
              </h3>
              <p className="text-sm text-slate-600 max-w-sm">
                Start a conversation with our AI-powered assistant. Share what's on your mind, and get immediate support.
              </p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        {activeView === 'circle' && (
          <div className="bg-white/80 backdrop-blur-lg border-t border-slate-200/50 p-4">
            <div className="flex items-end gap-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="p-3 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition disabled:opacity-50"
              >
                {isUploading ? (
                  <div className="animate-spin h-5 w-5 border-2 border-indigo-600 border-t-transparent rounded-full" />
                ) : (
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
              <div className="flex-1 relative">
                <textarea
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Message your circle..."
                  rows={1}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none bg-white/50 backdrop-blur"
                  style={{ minHeight: '48px', maxHeight: '120px' }}
                />
              </div>
              <button
                onClick={handleSendMessage}
                disabled={!messageInput.trim()}
                className="p-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg"
              >
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">
              Press Enter to send, Shift + Enter for new line
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
