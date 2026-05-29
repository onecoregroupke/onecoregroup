import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}', '../../packages/ui/src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: { colors: { 'glitz-gold': '#b07a00' } } },
  plugins: [],
}
export default config
