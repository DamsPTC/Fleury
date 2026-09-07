import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Fleury — Mes médias Discord',description:'Récupérer et sauvegarder les médias de ses salons Discord dans un espace privé.',robots:{index:false,follow:false},referrer:'no-referrer',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="fr"><body>{children}</body></html>;}
