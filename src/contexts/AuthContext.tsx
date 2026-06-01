'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode } from 'react';
import { account, teams, databases } from '@/lib/appwrite';
import { DATABASE_ID, MEMBERS_COLLECTION_ID } from '@/lib/constants/collections';
import { User, TeamMembership, AuthContextType } from '@/types';
import { OAuthProvider, Query } from 'appwrite';
import toast from 'react-hot-toast';
import { createLogger } from '@/lib/api/logger';

const log = createLogger({ action: 'AuthContext' });

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// JWT cache to avoid creating new JWTs on every API call
interface JWTCache {
    jwt: string;
    expiresAt: number;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userTeams, setUserTeams] = useState<TeamMembership[]>([]);
    const [loading, setLoading] = useState(true);
    const [profileCompleted, setProfileCompleted] = useState<boolean | null>(null);
    const [profileLoading, setProfileLoading] = useState(false);
    const jwtCacheRef = useRef<JWTCache | null>(null);

    const checkProfile = useCallback(async (userId: string) => {
        setProfileLoading(true);
        try {
            const res = await databases.listDocuments(DATABASE_ID, MEMBERS_COLLECTION_ID, [
                Query.equal('userID', userId),
                Query.limit(1),
            ]);
            setProfileCompleted(res.documents.length > 0 && res.documents[0].profileCompleted === true);
        } catch {
            console.error('Failed to check profile completion status');
            setProfileCompleted(false);
        } finally {
            setProfileLoading(false);
        }
    }, []);

    // Check if user is already logged in on mount
    useEffect(() => {
        const init = async () => {
            try {
                await refresh();
            } catch (err) {
                console.error('Failed to initialize auth:', err);
            }
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const refresh = useCallback(async () => {
        try {
            const currentUser = await account.get();
            setUser(currentUser as unknown as User);

            // Fetch user's team memberships
            const teamsList = await teams.list();
            setUserTeams(teamsList.teams.map(t => ({ $id: t.$id, name: t.name, userId: '' })));

            // Check if profile exists
            await checkProfile(currentUser.$id);
        } catch {
            log.error('Session expired', new Error('Session cookie invalid/expired'));
            setUser(null);
            setUserTeams([]);
            toast.error('Session expired. Please log in again.');
        } finally {
            setLoading(false);
        }
    }, [checkProfile]);

    const login = useCallback(async () => {
        try {
            // Trigger Google OAuth
            const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
            sessionStorage.setItem('auth_return_url', returnTo || '/');

            // Redirect to current page after login
            const redirectUrl = `${window.location.origin}/auth/callback`;
            await account.createOAuth2Session(
                OAuthProvider.Google,
                redirectUrl,
                redirectUrl
            );
        } catch (error) {
            log.error('Login failed', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            await account.deleteSession('current');
            setUser(null);
            setUserTeams([]);
            setProfileCompleted(null);
        } catch (error) {
            log.error('Logout failed', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }, []);

    const isChairOf = useCallback((societySlug: string): boolean => {
        if (!user || !userTeams.length) return false;

        // Check if user is member of chair_{societySlug} team
        const chairTeamName = `chair_${societySlug}`;
        return userTeams.some(
            (team) => team.$id === chairTeamName || team.name?.toLowerCase().includes(chairTeamName)
        );
    }, [user, userTeams]);

    // Get JWT for API calls - creates one if needed, uses cache otherwise
    const getJWT = useCallback(async (): Promise<string | null> => {
        if (!user) {
            log.warn('getJWT called but user is null');
            return null;
        }
        
        // Check cache - use if we have at least 60 seconds before expiry
        const now = Date.now();
        if (jwtCacheRef.current && jwtCacheRef.current.expiresAt > now + 60000) {
            return jwtCacheRef.current.jwt;
        }
        
        try {
            // Create new JWT (expires in 15 minutes by default)
            const result = await account.createJWT();
            
            // Cache it (assume 15 min expiry = 900 seconds)
            jwtCacheRef.current = {
                jwt: result.jwt,
                expiresAt: now + (14 * 60 * 1000), // 14 minutes to be safe
            };
            
            return result.jwt;
        } catch (error) {
            log.error('Failed to create JWT', error instanceof Error ? error : new Error(String(error)));
            return null;
        }
    }, [user]);

    const contextValue = useMemo(
        () => ({ user, loading, profileCompleted, profileLoading, login, logout, refresh, isChairOf, userTeams, getJWT }),
        [user, loading, profileCompleted, profileLoading, login, logout, refresh, isChairOf, userTeams, getJWT]
    );

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
