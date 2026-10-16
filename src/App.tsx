import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <main className="welcome">
      <p className="eyebrow">WESTROCK</p>
      <h1>A fresh start for your next idea.</h1>
      <p>Your web app starts here. Build something useful, one step at a time.</p>
      <section className="demo" aria-labelledby="demo-title">
        <h2 id="demo-title">Try your first interaction</h2>
        <p aria-live="polite">You clicked {count} {count === 1 ? 'time' : 'times'}.</p>
        <button onClick={() => setCount((value) => value + 1)}>Click me</button>
        <button className="secondary" onClick={() => setCount(0)}>Reset</button>
      </section>
    </main>
  )
}

export default App
