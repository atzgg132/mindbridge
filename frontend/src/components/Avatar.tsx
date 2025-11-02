import { generateColorFromName, getInitials } from '../lib/avatar'

interface AvatarProps {
  name: string
  profilePicture?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeClasses = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-2xl',
}

export default function Avatar({ name, profilePicture, size = 'md', className = '' }: AvatarProps) {
  const initials = getInitials(name)
  const bgColor = generateColorFromName(name)

  if (profilePicture) {
    return (
      <img
        src={profilePicture}
        alt={name}
        className={`${sizeClasses[size]} rounded-full object-cover ${className}`}
      />
    )
  }

  return (
    <div
      className={`${sizeClasses[size]} ${bgColor} rounded-full flex items-center justify-center text-white font-semibold ${className}`}
    >
      {initials}
    </div>
  )
}
