import { useEffect, useState } from 'react';
import SubmitPage from './pages/SubmitPage.jsx';
import ApplicationsPage from './pages/ApplicationsPage.jsx';
import RequestsPage from './pages/RequestsPage.jsx';
import { getApplications, getRequests } from './api.js';

const NAV = [
  { key: 'submit', label: '서류 접수', icon: IconUpload },
  { key: 'applications', label: '신청 내역', icon: IconList },
  { key: 'requests', label: '정보 제공 요청', icon: IconMail },
];

export default function App() {
  const [page, setPage] = useState('applications');
  const [focusId, setFocusId] = useState(null);
  const [badges, setBadges] = useState({});

  const refreshBadges = async () => {
    const [apps, reqs] = await Promise.all([getApplications(), getRequests()]);
    setBadges({
      applications: apps.filter((a) => !a.is_stored && a.decision !== '반려').length,
      requests: reqs.filter((r) => r.status === '대기').length,
    });
  };
  useEffect(() => {
    refreshBadges();
  }, [page]);

  const openApplication = (id) => {
    setFocusId(id);
    setPage('applications');
  };

  return (
    <div className="shell">
      <aside className="rail">
        <div className="mark">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <rect x="5" y="4" width="17" height="22" rx="2" />
            <rect x="10" y="7" width="17" height="22" rx="2" className="front" />
            <path d="M14 18l3 3 6-7" className="tick" />
          </svg>
          <div>
            <strong>여신 서류 검토</strong>
            <span>소프트로지점</span>
          </div>
        </div>
        <nav>
          {NAV.map(({ key, label, icon: Icon }) => (
            <button key={key} className={`nav ${page === key ? 'on' : ''}`} onClick={() => setPage(key)} aria-current={page === key ? 'page' : undefined}>
              <Icon />
              <span>{label}</span>
              {badges[key] > 0 && <em aria-label={`처리 대기 ${badges[key]}건`}>{badges[key]}</em>}
            </button>
          ))}
        </nav>
        <div className="me">
          <span className="avatar">김</span>
          <div>
            <strong>김하늘 계장</strong>
            <span>여신심사팀</span>
          </div>
        </div>
      </aside>

      <main className="main">
        {page === 'submit' && <SubmitPage onOpen={openApplication} />}
        {page === 'applications' && <ApplicationsPage focusId={focusId} onChanged={refreshBadges} />}
        {page === 'requests' && <RequestsPage onChanged={refreshBadges} />}
      </main>
    </div>
  );
}

function IconUpload() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 13V3M6 7l4-4 4 4M3 13v3a1 1 0 001 1h12a1 1 0 001-1v-3" />
    </svg>
  );
}
function IconList() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7 5h10M7 10h10M7 15h10M3 5h.01M3 10h.01M3 15h.01" />
    </svg>
  );
}
function IconMail() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 5h14v10H3zM3 5l7 6 7-6" />
    </svg>
  );
}
