import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://mxyjvijclhlxrlafqcrz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14eWp2aWpjbGhseHJsYWZxY3J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNDA1MTQsImV4cCI6MjA4MzgxNjUxNH0.DeEJrynoil34MXrZMGBtouyHBX0ldsgK__H97NYBFyM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
