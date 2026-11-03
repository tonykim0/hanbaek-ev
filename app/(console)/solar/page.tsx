import { redirect } from 'next/navigation';
import { BIZ_HOME } from '@/lib/biz';

/** /solar — 태양광의 첫 화면(부지 검토)으로 보낸다. 화면은 그 아래에 있다(/solar/check · /solar/sites) */
export default function SolarRoot() {
  redirect(BIZ_HOME.solar);
}
