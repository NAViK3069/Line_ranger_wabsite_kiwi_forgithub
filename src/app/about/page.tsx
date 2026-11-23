// ====================================================
// About Me — หน้าสาธารณะแสดงข้อมูลเจ้าของเว็บ
// ====================================================

import BackHomeLink from '@/components/BackHomeLink'
import profileData from '../../../content/site-profile.json'
import { safeUrl } from '@/lib/safeUrl'

// ข้อมูลอ่านจาก content/site-profile.json ตอน build (แอดมินแก้ → commit → build ใหม่)

interface LinkEntry {
  label: string
  url: string
}

// แปลง URL ในข้อความให้เป็น link คลิกได้
function linkifyText(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = text.split(urlRegex)
  return parts.map((part, i) =>
    urlRegex.test(part) ? (
      <a key={i} href={safeUrl(part)} target="_blank" rel="noopener noreferrer"
        className="underline hover:text-yellow-200 transition-colors break-all">
        {part}
      </a>
    ) : part
  )
}

export default function AboutPage() {
  const profile = profileData as typeof profileData | null

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-5xl mx-auto">

        {/* Back */}
        <BackHomeLink className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors mb-8" />

        {!profile || (!profile.displayName && !profile.description && !profile.profileImage) ? (
          <div className="card-glass rounded-2xl p-10 text-center text-gray-400">
            ยังไม่มีข้อมูล About Me
          </div>
        ) : (
          <div className="space-y-6">

            {/* Announcement */}
            {profile.announcement && (
              <div className="px-5 py-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-300 text-sm font-medium flex items-start gap-2">
                <span className="material-icons-round text-base shrink-0 mt-0.5">campaign</span>
                <span>{linkifyText(profile.announcement)}</span>
              </div>
            )}

            {/* Profile card */}
            <div className="card-glass rounded-2xl p-8">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">

                {/* Avatar */}
                {profile.profileImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={safeUrl(profile.profileImage)}
                    alt={profile.displayName}
                    className="w-28 h-28 rounded-full object-cover border-2 border-purple-500/50 shrink-0"
                  />
                ) : (
                  <div className="w-28 h-28 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-5xl text-gray-500">person</span>
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 text-center sm:text-left">
                  {profile.displayName && (
                    <h1 className="text-2xl font-black text-white mb-3">{profile.displayName}</h1>
                  )}
                  <div className="flex flex-wrap justify-center sm:justify-start gap-4">
                    {profile.email && (
                      <a
                        href={`mailto:${profile.email}`}
                        className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors"
                      >
                        <span className="material-icons-round text-base text-purple-400">email</span>
                        {profile.email}
                      </a>
                    )}
                    {profile.facebookName && (
                      <a
                        href={safeUrl(profile.facebookUrl) ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors"
                      >
                        <span className="material-icons-round text-base text-blue-400">group</span>
                        {profile.facebookName}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              {profile.description && (
                <p className="mt-6 text-gray-300 text-sm leading-relaxed whitespace-pre-wrap border-t border-white/10 pt-5">
                  {profile.description}
                </p>
              )}
            </div>

            {/* Extra links */}
            {Array.isArray(profile.links) && (profile.links as unknown as LinkEntry[]).length > 0 && (
              <div className="card-glass rounded-2xl p-6">
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="material-icons-round text-base">link</span>
                  ลิงก์อื่น ๆ
                </h2>
                <div className="flex flex-wrap gap-3">
                  {(profile.links as unknown as LinkEntry[]).map((link, i) => (
                    <a
                      key={i}
                      href={safeUrl(link.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/10 transition-all hover:scale-105 flex items-center gap-1.5"
                    >
                      <span className="material-icons-round text-sm">open_in_new</span>
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </main>
  )
}
