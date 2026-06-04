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
        <Link
          href="/"
          className="inline-flex bg-nn-green text-white font-medium px-6 py-3 rounded-full hover:bg-green-900 transition-colors"
        >
          Back to Catalogue
        </Link>
      </div>
    </div>
  )
}
