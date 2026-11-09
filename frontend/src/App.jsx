import { useEffect, useState } from 'react'
import Header from './components/Header.jsx'
import MailPage from './pages/MailPage.jsx'
import ApplicationsPage from './pages/ApplicationsPage.jsx'
import SubmitPage from './pages/SubmitPage.jsx'
import { getBadgeCounts } from './api.js'

export default function App() {
  const [page, setPage] = useState('mail')
  const [focusId, setFocusId] = useState(null)
  const [badges, setBadges] = useState({})

  const refreshBadges = () => getBadgeCounts().then(setBadges).catch(() => {})
  useEffect(() => {
    refreshBadges()
  }, [page])

  const go = (next) => {
    setFocusId(null)
    setPage(next)
  }
  const openApplication = (id) => {
    setFocusId(id)
    setPage('applications')
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
