import {redirect} from 'next/navigation';

/** Preserve older internal bookmarks without duplicating medical administration. */
export default function DoctorsPage(){
  redirect('/subaccounts?type=DOCTOR');
}
