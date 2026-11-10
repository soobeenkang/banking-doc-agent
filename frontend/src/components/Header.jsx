const TABS = [
  { id: 'mail', label: '자료 제공 요청' },
  { id: 'applications', label: '신청 내역' },
  { id: 'submit', label: '서류 접수' },
]

// 배지 숫자의 뜻 (스크린 리더용)
const BADGE_LABEL = { mail: '전송 대기', applications: '미통과' }

export default function Header({ page, onPage, badges = {} }) {
  return (
    <header className="header">
      <div className="header__inner">
        <div className="brand">
          <span className="brand__icon" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" />
              <path d="M8.5 12l2.5 2.5 4.5-5" />
            </svg>
          </span>
          <span className="brand__name">대출서류 민감정보 판정 및 위험도 분석</span>
        </div>

        <nav className="nav" aria-label="주요 메뉴">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={'nav__item' + (page === tab.id ? ' is-active' : '')}
              onClick={() => onPage(tab.id)}
              aria-current={page === tab.id ? 'page' : undefined}
            >
              {tab.label}
              {badges[tab.id] > 0 && (
                <span className="count-badge" aria-label={`${BADGE_LABEL[tab.id]} ${badges[tab.id]}건`}>
                  {badges[tab.id]}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="user">
          <span className="user__name">김하나 담당자</span>
          <span className="user__avatar" aria-hidden="true">김</span>
        </div>
      </div>
    </header>
  )
}
