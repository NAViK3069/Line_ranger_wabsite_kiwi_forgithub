// ====================================================
// Admin Upload Page - อัปโหลดรูปตารางอัตราสุ่ม
// AI Vision จะแปลงรูปเป็นข้อมูลให้อัตโนมัติ
// ====================================================

export default function AdminUploadPage() {
  return (
    <div>
      <h1 className="text-3xl font-black text-white mb-2">
        🖼️ อัปโหลดตารางอัตราสุ่ม
      </h1>
      <p className="text-gray-400 mb-8">
        อัปโหลดรูปตารางอัตราการสุ่มจากเกม — AI จะอ่านข้อมูลให้อัตโนมัติ
      </p>

      <div className="card-glass p-8 text-center">
        <div className="text-6xl mb-4">🚧</div>
        <h2 className="text-xl font-semibold text-white mb-2">กำลังพัฒนา</h2>
        <p className="text-gray-400">
          ฟีเจอร์ AI Vision จะถูกพัฒนาในขั้นตอนถัดไป
          <br />
          ต้องตั้งค่า OPENAI_API_KEY ใน .env.local ก่อน
        </p>
      </div>
    </div>
  )
}
