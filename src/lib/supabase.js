import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définis dans .env — ' +
      'puis redémarre le serveur Vite, il ne relit pas .env à chaud.'
  )
}

// Même projet Supabase que alerte_secours_web : mêmes valeurs de .env,
// pour lire la même base de secours (events, messages, bilans_terrain…).
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
