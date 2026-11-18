// ====================================================
// Admin Dashboard - หน้าหลักของ Admin Panel
// ====================================================

import Link from 'next/link'

export default function AdminDashboardPage() {
  const menuItems = [
    {
      href: '/admin/Gacha-ranger',
      icon: 'casino',
      title: 'จัดการ Gacha เรนเจอร์',
      description: 'เพิ่ม แก้ไข Banner การสุ่มเรนเจอร์',
    },
    {
      href: '/admin/Gacha-Gear',
      icon: 'shield',
      title: 'จัดการ Gacha เกียร์',
      description: 'เพิ่ม แก้ไข ข้อมูลเกียร์',
    },
    {
      href: '/admin/about-me',
      icon: 'manage_accounts',
      title: 'About Me',
      description: 'ตั้งค่าโปรไฟล์และข้อมูลเจ้าของเว็บ',
    },
    {
      href: '/admin/top40-legend',
      icon: 'emoji_events',
      title: 'Top 40 Legend',
      description: 'จัดอันดับเรนเจอร์ Legend League',
    },
    {
      href: '/admin/ranger-book',
      icon: 'menu_book',
      title: 'Ranger Book',
      description: 'จัดการและอัพเดตข้อมูลเรนเจอร์ทั้งหมด',
    },
    {
      href: '/admin/gear-book',
      icon: 'inventory_2',
      title: 'Gear Book',
      description: 'ดูข้อมูลเกียร์ทั้งหมดที่ sync จาก lerico.net',
    },
    {
      href: '/admin/lobby',
      icon: 'photo_camera',
      title: 'Lobby',
      description: 'จัดฉากล็อบบี้แล้วเซฟเป็นรูป — จัดวางวัตถุได้และเลือกเรนเจอร์ได้ทุกตัว',
    },
  ]

  return (
    <div>
      <h1 className="text-3xl font-black text-white mb-2">Admin Dashboard</h1>
      <p className="text-gray-400 mb-8">ยินดีต้อนรับสู่ระบบหลังบ้าน</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card-glass p-6 hover:bg-white/10 transition-all hover:scale-[1.02] group"
          >
            <span className="material-icons-round text-4xl text-purple-400 group-hover:text-yellow-400 transition-colors mb-3 block">
              {item.icon}
            </span>
            <h2 className="text-lg font-semibold text-white group-hover:text-gradient-gold transition-all">
              {item.title}
            </h2>
            <p className="text-sm text-gray-400 mt-1">{item.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
