
import { User, UserTier } from "../types";
import { supabase } from "./supabaseClient";

// Returns a list of users known to this client's local registry to support synchronous stats calculation.
export const getAllUsers = (): User[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('sedrex_known_users');
  return stored ? JSON.parse(stored) : [];
};

// Helper function to register a user in the local registry for synchronous analytics retrieval.
const registerUserLocally = (user: User) => {
  if (typeof window === 'undefined') return;
  const users = getAllUsers();
  if (!users.find(u => u.id === user.id)) {
    users.push(user);
    localStorage.setItem('sedrex_known_users', JSON.stringify(users));
  }
};

/**
 * Robustly retrieves the current user session and profile.
 * If the database profile is missing (common locally if triggers aren't set up),
 * it will automatically try to create one or fallback to Auth metadata.
 */
export const getCurrentUser = async (): Promise<User | null> => {
  if (!supabase) return null;
  
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session || !session.user) return null;

    const authUser = session.user;
    
    // Default values from Auth metadata/session
    let userTier: UserTier = 'free';
    let isAdmin = false;
    let fullName = authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Explorer';

    // Attempt to fetch profile record with a timeout to prevent hanging
    try {
      const profilePromise = supabase
        .from('profiles')
        .select('tier, is_admin, full_name')
        .eq('id', authUser.id)
        .maybeSingle();
      
      // Race against a 5s timeout to prevent login freeze on slow DB
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
      const result = await Promise.race([profilePromise, timeoutPromise]);
      
      const profile = result && 'data' in result ? result.data : null;

      if (profile) {
        userTier = (profile.tier as UserTier) || 'free';
        isAdmin = profile.is_admin || false;
        fullName = profile.full_name || fullName;
      } else {
        // SELF-HEALING: If the profile is missing from the DB, try to create it now.
        supabase.from('profiles').upsert({
          id: authUser.id,
          full_name: fullName,
          tier: 'free',
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' }).then(null, () => {});
      }
    } catch (e) {
      console.warn("Profile fetch failed, using defaults");
    }

    // Fixed: Using personification instead of persona
    const user: User = {
      id: authUser.id,
      email: authUser.email || '',
      createdAt: new Date(authUser.created_at).getTime(),
      tier: userTier,
      isAdmin: isAdmin,
      personification: fullName
    };

    registerUserLocally(user);
    return user;
  } catch (globalErr: any) {
    // iOS WebKit throws "TypeError: Load failed" for network errors — return null gracefully
    const msg = (globalErr?.message || '').toLowerCase();
    if (msg.includes('load failed') || msg.includes('failed to fetch') || msg.includes('network')) {
      console.warn('Network error during auth check (iOS/mobile) — will retry on next interaction');
      return null;
    }
    console.error("Critical error in getCurrentUser:", globalErr);
    return null;
  }
};

export const login = async (email: string, password: string): Promise<User> => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  if (!data.user) throw new Error("Authentication failed.");

  const user = await getCurrentUser();
  if (!user) {
    // Return a base user object if database sync is still catching up
    return {
      id: data.user.id,
      email: data.user.email || email,
      createdAt: new Date(data.user.created_at).getTime(),
      tier: 'free'
    };
  }
  return user;
};

/**
 * Handles account registration with enhanced error resilience.
 * If Supabase returns a 'Database error', we check if the user was actually created.
 */
export const signup = async (email: string, password: string, name?: string): Promise<User> => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { 
        full_name: name || email.split('@')[0]
      }
    }
  });

  if (error) {
    // If user was created but a backend trigger failed, Supabase throws 'Database error'.
    // In this case, 'data.user' will often still be present or the user will exist on next attempt.
    const isDbError = error.message.toLowerCase().includes('database error');
    if (isDbError && data?.user) {
      console.warn("User created but trigger failed. Proceeding with Auth session.");
    } else {
      throw error;
    }
  }

  if (!data.user) throw new Error("Registration failed.");

  const newUser: User = {
    id: data.user.id,
    email: data.user.email || email,
    createdAt: Date.now(),
    tier: 'free'
  };

  registerUserLocally(newUser);
  return newUser;
};

export const loginWithGoogle = async () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'https://sedrexai.com/auth/callback' // Ensure this matches your Supabase redirect URI
    }
  });
  if (error) throw error;
};

export const forgotPassword = async (email: string): Promise<void> => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}?type=recovery`,
  });
  if (error) throw error;
};

export const logout = async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
};
