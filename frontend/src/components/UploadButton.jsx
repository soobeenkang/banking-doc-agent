// "서류 접수" 버튼. 누르면 서류 접수 화면으로 이동한다. (업로드·검증·결과는 SubmitPage에서)
export default function UploadButton({ onClick }) {
  return (
    <button type="button" className="btn btn--primary btn--block" onClick={onClick}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 16V4" />
        <path d="M7 9l5-5 5 5" />
        <path d="M4 20h16" />
      </svg>
      서류 접수
    </button>
  )
}
