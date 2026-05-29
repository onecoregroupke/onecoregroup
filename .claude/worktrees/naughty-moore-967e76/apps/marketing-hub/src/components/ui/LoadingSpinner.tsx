export function LoadingSpinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="w-8 h-8 border-4 border-ocg-navy border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}
