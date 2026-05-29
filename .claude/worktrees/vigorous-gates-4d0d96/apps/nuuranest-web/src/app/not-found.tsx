import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-nn-bg flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <p className="text-nn-gold font-medium text-sm uppercase tracking-wider mb-3">404</p>
        <h1 className="font-heading text-4xl font-bold text-nn-dark mb-4">Page Not Found</h1>
        <p className="text-gray-600 mb-8">
          {"The page you're looking for doesn't exist. Let's get you back on track."}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="bg-nn-green text-white font-medium px-6 py-3 rounded-full hover:bg-green-900 transition-colors"
          >
            Back to Home
          </Link>
          <Link
            href="/properties"
            className="border-2 border-nn-green text-nn-green font-medium px-6 py-3 rounded-full hover:bg-nn-green hover:text-white transition-colors"
          >
            Browse Properties
          </Link>
        </div>
      </div>
    </div>
  )
}
