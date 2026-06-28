import { redirect } from 'next/navigation'

// /admin は実データ画面 /admin/dashboard に集約する
export default function AdminIndexPage() {
  redirect('/admin/dashboard')
}
