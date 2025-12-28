import { useEffect, useState } from 'react'

function About() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    document.title = 'Cale Shapera'
  }, [])

  return (
    <main 
      className={`about-page transition-opacity duration-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}
    >
      <div className="about-content">
        {/* <p>
          Hello, I'm Cale Shapera - a creative technologist currently working as a Product Engineer at <a href="https://inworld.ai" target="_blank" rel="noopener noreferrer">Inworld AI</a>.
        </p> */}

        <blockquote className="quote">
          <p>This is the true joy in life, being used for a purpose recognized by yourself as a mighty one. Being a force of nature instead of a feverish, selfish little clod of ailments and grievances, complaining that the world will not devote itself to making you happy. I am of the opinion that my life belongs to the whole community and as long as I live, it is my privilege to do for it what I can. I want to be thoroughly used up when I die, for the harder I work, the more I live. I rejoice in life for its own sake. Life is no brief candle to me. It is a sort of splendid torch which I have got hold of for the moment and I want to make it burn as brightly as possible before handing it on to future generations.</p>
          <footer>— George Bernard Shaw</footer>
        </blockquote>
      </div>
    </main>
  )
}

export default About
