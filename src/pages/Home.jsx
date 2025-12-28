import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'

function Home() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    document.title = 'Cale Shapera'
  }, [])

  return (
    <div 
      className={`min-h-screen flex flex-col justify-center items-center text-center px-6 transition-opacity duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}
    >
      <h1 
        className="text-4xl md:text-5xl font-light tracking-tight mb-2"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        Cale Shapera
      </h1>
      <p></p>
      <Link 
        to="/about" 
        className="enter-link text-sm tracking-widest no-underline"
        style={{ letterSpacing: '0.15em' }}
      >
        <span className="bracket">[</span>
        <span className="enter-text">enter</span>
        <span className="bracket">]</span>
      </Link>
    </div>
  )
}

export default Home
