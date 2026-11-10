import { useEffect, useState } from 'react'
import Header from './components/Header.jsx'
import MailPage from './pages/MailPage.jsx'
import ApplicationsPage from './pages/ApplicationsPage.jsx'
import SubmitPage from './pages/SubmitPage.jsx'
import { getBadgeCounts } from './api.js'

const PAGES = ['mail', 'applications', 'submit']

// 주소의 해시로 현재 화면을 기억한다. 새로고침해도 같은 화면에 머문다.
//   #mail, #submit, #applications, #applications/123
function readHash() {
  const [name, id] = window.location.hash.replace(/^#\/?/, '').split('/')
  return {
    page: PAGES.includes(name) ? name : 'mail',
    focusId: name === 'applications' && id ? Number(id) : null,
  }
}

export default function App() {
  const [route, setRoute] = useState(readHash)
  const [badges, setBadges] = useState({})
  const { page, focusId } = route

  useEffect(() => {
    const onHash = () => setRoute(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const refreshBadges = () => getBadgeCounts().then(setBadges).catch(() => {})
  useEffect(() => {
    refreshBadges()
  }, [page])

  const go = (next) => {
    window.location.hash = next
  }
  const openApplication = (id) => {
    window.location.hash = `applications/${id}`
  }

  return (
    <div className="app">
      <Header page={page} onPage={go} badges={badges} />
      {page === 'mail' && <MailPage onChanged={refreshBadges} onSubmit={() => go('submit')} />}
      {page === 'applications' && <ApplicationsPage focusId={focusId} onSubmit={() => go('submit')} />}
      {page === 'submit' && <SubmitPage onOpen={openApplication} onDone={refreshBadges} />}
    </div>
  )
}
