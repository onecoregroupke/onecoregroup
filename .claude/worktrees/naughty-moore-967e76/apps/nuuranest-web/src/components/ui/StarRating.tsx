import { Star } from 'lucide-react'

interface StarRatingProps {
  rating: number
  max?: number
  size?: number
}

export function StarRating({ rating, max = 5, size = 16 }: StarRatingProps) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          size={size}
          className={i < rating ? 'fill-nn-gold text-nn-gold' : 'fill-gray-200 text-gray-200'}
        />
      ))}
    </div>
  )
}
