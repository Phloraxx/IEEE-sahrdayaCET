'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useSession, signIn } from 'next-auth/react';
import { useScrollLock } from '@/hooks/useScrollLock';
import {
    RegistrationStep,
    Registration,
    Ticket,
    FormTemplate,
    RegistrationData
} from '@/types/registration';
import DynamicRegistrationForm from './DynamicRegistrationForm';
import PaymentModal, { PaymentData } from './PaymentModal';
import TicketDisplay from './TicketDisplay';
import toast from 'react-hot-toast';

interface EventRegistrationModalProps {
    event: (Event & { society?: Society }) | null;
    isOpen: boolean;
    onClose: () => void;
}

interface Event {
    $id: string;
    $createdAt: string;
    $updatedAt: string;
    title: string;
    description?: string;
    date: string;
    venue?: string;
    price: number;
    banner_url?: string;
    society_id?: string;
    status: string;
    registration_open?: boolean;
    max_capacity?: number;
}

interface Society {
    $id: string;
    name: string;
    logo_url?: string;
}

// Step indicator component
const StepIndicator: React.FC<{
    currentStep: RegistrationStep;
    isPaidEvent: boolean;
}> = ({ currentStep, isPaidEvent }) => {
    const steps: { id: RegistrationStep; label: string }[] = [
        { id: 'auth', label: 'Login' },
        { id: 'form', label: 'Details' },
        ...(isPaidEvent ? [{ id: 'payment' as RegistrationStep, label: 'Payment' }] : []),
        { id: 'success', label: 'Ticket' },
    ];

    const getCurrentIndex = () => steps.findIndex(s => s.id === currentStep);
    const currentIndex = getCurrentIndex();

    return (
        <div className="flex items-center justify-between px-8 sm:px-12 pt-6 pb-8 bg-white/70 backdrop-blur-xl border-b border-gray-100/50 relative">
            {/* Background track */}
            <div className="absolute top-[40px] left-[60px] right-[60px] h-[3px] bg-gray-100/80 rounded-full overflow-hidden">
                {/* Active track */}
                <motion.div
                    className="h-full bg-ieee-blue/90 w-full origin-left relative"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: currentIndex / (steps.length - 1) }}
                    transition={{ type: "spring", stiffness: 120, damping: 20 }}
                >
                    {/* Subtle shimmer effect on active track */}
                    <motion.div 
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                        animate={{ x: ['-100%', '200%'] }}
                        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    />
                </motion.div>
            </div>

            {steps.map((step, index) => {
                const isActive = step.id === currentStep;
                const isPast = currentIndex > index;

                return (
                    <div key={step.id} className="relative z-10 flex flex-col items-center">
                        <motion.div
                            initial={false}
                            animate={{
                                backgroundColor: isActive || isPast ? '#00629B' : '#ffffff',
                                borderColor: isActive || isPast ? '#00629B' : '#E5E7EB',
                                scale: isActive ? 1.2 : 1,
                                color: isActive || isPast ? '#ffffff' : '#9CA3AF'
                            }}
                            className="w-[32px] h-[32px] rounded-full border-[2px] flex items-center justify-center text-[12px] font-semibold shadow-sm transition-all duration-300 z-10"
                        >
                            {isPast ? (
                                <motion.svg 
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                    className="w-4 h-4" 
                                    fill="none" 
                                    viewBox="0 0 24 24" 
                                    stroke="currentColor" 
                                    strokeWidth={3}
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </motion.svg>
                            ) : (
                                <span>{index + 1}</span>
                            )}
                        </motion.div>
                        <motion.span 
                            animate={{
                                y: isActive ? 0 : -2,
                                opacity: isActive ? 1 : 0.6
                            }}
                            className={`absolute -bottom-7 text-[11px] sm:text-[12px] font-medium tracking-wide transition-colors duration-300 whitespace-nowrap ${isActive ? 'text-ieee-blue' : 'text-gray-500'}`}
                        >
                            {step.label}
                        </motion.span>
                    </div>
                );
            })}
        </div>
    );
};

// Auth Step Component
const AuthStep: React.FC<{
    onLogin: () => void;
    isLoading: boolean;
}> = ({ onLogin, isLoading }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="flex flex-col items-center justify-center py-20 px-6 text-center"
        >
            {/* Premium Illustration container */}
            <div className="relative w-32 h-32 mb-10 group cursor-default">
                {/* Outer animated soft glow */}
                <motion.div 
                    animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.5, 0.3] }}
                    transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                    className="absolute inset-0 bg-ieee-blue/10 rounded-[40px] blur-xl" 
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-ieee-blue/20 to-ieee-light-blue/20 rounded-[36px] rotate-6 group-hover:rotate-12 transition-all duration-700 ease-out backdrop-blur-3xl" />
                <div className="absolute inset-0 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-[32px] border border-white/60 flex items-center justify-center rotate-0 group-hover:-rotate-6 transition-all duration-700 ease-out z-10 overflow-hidden backdrop-blur-xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-white/40 z-0" />
                    <svg className="w-14 h-14 text-ieee-blue z-10 relative drop-shadow-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                </div>
            </div>

            <h3 className="text-[26px] font-semibold tracking-[-0.015em] text-gray-900 mb-3">
                Join the Action
            </h3>
            <p className="text-[15px] text-gray-500 mb-10 max-w-[280px] leading-relaxed font-normal">
                Sign in with your Google account to secure your spot for this event.
            </p>

            <button
                onClick={onLogin}
                disabled={isLoading}
                className="group relative w-full max-w-[320px] bg-white text-gray-700 font-medium py-4 px-6 rounded-[24px] transition-all duration-300 flex items-center justify-center gap-4 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08),0_1px_3px_0_rgba(0,0,0,0.04)] hover:shadow-[0_12px_24px_-8px_rgba(0,0,0,0.12),0_4px_8px_-2px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 border border-gray-100 overflow-hidden"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-50/50 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
                {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                ) : (
                    <>
                        <svg className="w-[22px] h-[22px] flex-shrink-0" viewBox="0 0 24 24">
                            <path fill="#EA4335" d="M12.0001 4.75C13.7711 4.75 15.3551 5.36002 16.6061 6.54998L20.0301 3.126C17.9501 1.19 15.2341 0 12.0001 0C7.30907 0 3.25507 2.69 1.23907 6.65002L5.26607 9.765C6.20807 6.75 9.04907 4.75 12.0001 4.75Z" />
                            <path fill="#34A853" d="M23.4901 12.275C23.4901 11.411 23.4151 10.525 23.2651 9.67505H12.0001V14.4H18.4351C18.1581 15.939 17.2651 17.258 15.9001 18.175V21.192H19.7701C22.0351 19.106 23.4901 15.968 23.4901 12.275Z" />
                            <path fill="#4A90E2" d="M5.26508 14.235C5.02508 13.504 4.88208 12.721 4.88208 11.906C4.88208 11.091 5.02508 10.308 5.26508 9.57703L1.23908 6.462C0.450085 8.046 0.00012207 9.87103 0.00012207 11.906C0.00012207 13.941 0.450085 15.766 1.23908 17.35L5.26508 14.235Z" />
                            <path fill="#FBBC05" d="M12.0001 24.0001C15.2391 24.0001 17.9651 22.935 19.7701 21.192L15.9001 18.175C14.9251 18.828 13.5851 19.2501 12.0001 19.2501C9.04907 19.2501 6.20807 17.25 5.26607 14.235L1.23907 17.35C3.25507 21.31 7.30907 24.0001 12.0001 24.0001Z" />
                        </svg>
                        <span className="font-semibold text-[15px] tracking-tight">Continue with Google</span>
                    </>
                )}
            </button>
            <p className="mt-8 text-[12px] text-gray-400 font-medium tracking-wide">
                Secured by IEEE Student Branch
            </p>
        </motion.div>
    );
};

export default function EventRegistrationModal({
    event,
    isOpen,
    onClose,
}: EventRegistrationModalProps) {
    const { data: session, status: authStatus } = useSession();
    const user = session?.user;
    const authLoading = authStatus === 'loading';
    const [currentStep, setCurrentStep] = useState<RegistrationStep>('auth');
    const [formTemplate, setFormTemplate] = useState<FormTemplate | null>(null);
    const [formData, setFormData] = useState<RegistrationData | null>(null);
    const [registration, setRegistration] = useState<Registration | null>(null);
    const [ticket, setTicket] = useState<Ticket | null>(null);
    const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [existingRegistration, setExistingRegistration] = useState<Registration | null>(null);

    useScrollLock(isOpen);

    const isPaidEvent = event ? event.price > 0 : false;

    const getDefaultTemplate = (eventId: string): FormTemplate => ({
        eventId,
        title: 'Registration Form',
        fields: [],
        standardFields: {
            name: true,
            email: true,
            phone: true,
            semester: true,
            department: true,
            section: false,
            rollNumber: false,
        },
        customQuestions: [],
    });

    const fetchFormTemplate = useCallback(async () => {
        if (!event) return;

        try {
            const response = await fetch(`/api/events/${event.$id}/form-template`);
            if (response.ok) {
                const data = await response.json();
                const apiTemplate = data.form_template;
                if (apiTemplate) {
                    const template: FormTemplate = {
                        eventId: event.$id,
                        title: data.event_title || 'Registration Form',
                        fields: [],
                        standardFields: {
                            name: true,
                            email: true,
                            phone: true,
                            semester: true,
                            department: true,
                            section: false,
                            rollNumber: false,
                        },
                        customQuestions: (apiTemplate.questions || []).map((q: {
                            id: string;
                            type: string;
                            label: string;
                            placeholder?: string;
                            required?: boolean;
                            options?: string[];
                            validation?: {
                                min?: number;
                                max?: number;
                                pattern?: string;
                                message?: string;
                            };
                        }) => ({
                            id: q.id,
                            type: q.type as 'text' | 'email' | 'phone' | 'number' | 'select' | 'textarea' | 'checkbox' | 'radio',
                            label: q.label,
                            placeholder: q.placeholder,
                            required: q.required || false,
                            options: q.options,
                            validation: q.validation,
                        })),
                    };
                    setFormTemplate(template);
                } else {
                    setFormTemplate(getDefaultTemplate(event.$id));
                }
            } else {
                setFormTemplate(getDefaultTemplate(event.$id));
            }
        } catch {
            console.error('Failed to fetch form template, using default');
            setFormTemplate(getDefaultTemplate(event.$id));
        }
    }, [event]);

    // Check existing registration and determine initial step
    useEffect(() => {
        if (!isOpen || !event) return;

        const checkExistingRegistration = async () => {
            if (event.registration_open === false) {
                setCurrentStep('form');
                setError('Registrations are currently closed for this event.');
                return;
            }
            if (!user) {
                setCurrentStep('auth');
                return;
            }

            setIsLoading(true);
            try {
                // Guard: Check if user is logged in
                if (!user?.id) {
                    toast.error('Please log in');
                    setCurrentStep('auth');
                    setIsLoading(false);
                    return;
                }

                // Check if user already registered
                const response = await fetch(`/api/events/${event.$id}/registration?userId=${user.id}`, {
                    credentials: 'include',
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.registration) {
                        setExistingRegistration(data.registration);

                        const registrationId = data.registration.$id || data.registration.id;
                        let ticketId = data.registration.ticket_id || '';
                        let ticketCreatedAt = data.registration.$createdAt || data.registration.created_at || new Date().toISOString();

                        if (data.ticket) {
                            ticketId = data.ticket.$id || data.ticket.id || ticketId;
                            ticketCreatedAt = data.ticket.$createdAt || data.ticket.created_at || ticketCreatedAt;
                            try {
                                const qrData = JSON.parse(data.ticket.qr_data);
                                ticketId = qrData.ticket_id || data.ticket.$id || data.ticket.id || ticketId;
                            } catch {
                                // Use available ticket ID
                            }
                        }

                        if (registrationId && ticketId) {
                            const ticketData: Ticket = {
                                ticketId,
                                eventId: event.$id,
                                eventTitle: event.title,
                                eventDate: event.date,
                                eventVenue: event.venue,
                                userId: user.id || '',
                                userName: user.name || '',
                                userEmail: user.email || '',
                                registrationId,
                                status: 'confirmed',
                                qrCodeData: ticketId,
                                createdAt: ticketCreatedAt,
                            };

                            setTicket(ticketData);
                            setCurrentStep('success');
                            return;
                        }
                    }
                }

                // Fetch form template
                await fetchFormTemplate();
                setCurrentStep('form');
            } catch (err) {
                console.error('Error checking registration', err);
                // Proceed to form anyway
                await fetchFormTemplate();
                setCurrentStep('form');
            } finally {
                setIsLoading(false);
            }
        };

        checkExistingRegistration();
    }, [isOpen, event, user, fetchFormTemplate]);

    const handleLogin = async () => {
        setIsLoading(true);
        try {
            await signIn('google', { callbackUrl: window.location.href });
        } catch (err) {
            console.error('Login failed', err);
            toast.error('Login failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleFormSubmit = async (data: RegistrationData) => {
        if (!event || !user) return;
        if (event.registration_open === false) {
            toast.error('Registrations are currently closed for this event.');
            return;
        }

        setFormData(data);
        setIsLoading(true);
        setError(null);

        // Guard: Check if user is logged in
        if (!user?.id) {
            toast.error('Please log in');
            setCurrentStep('auth');
            setIsLoading(false);
            return;
        }

        try {
            // Submit registration via the custom API
            const response = await fetch('/api/registrations/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    eventId: event.$id,
                    ...data,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                if (response.status === 409 && errorData?.details?.registration_id) {
                    try {
                        const existingResponse = await fetch(`/api/registrations/${errorData.details.registration_id}`, {
                            credentials: 'include',
                        });
                        if (existingResponse.ok) {
                            const existingData = await existingResponse.json();
                            if (existingData.registration) {
                                const existingRegistrationId = existingData.registration.id || existingData.registration.$id;
                                const existingTicketId = existingData.ticket?.id || existingData.registration.ticket_id || '';
                                const existingReg: Registration = {
                                    $id: existingRegistrationId,
                                    $createdAt: existingData.registration.created_at || existingData.registration.$createdAt || new Date().toISOString(),
                                    $updatedAt: existingData.registration.updated_at || existingData.registration.$updatedAt || new Date().toISOString(),
                                    eventId: existingData.registration.event_id,
                                    userId: existingData.registration.user_id,
                                    ticketId: existingTicketId,
                                    status: existingData.registration.registration_status,
                                    paymentStatus: existingData.registration.payment_status,
                                    formData: (existingData.registration.form_data || {}) as Record<string, unknown>,
                                };
                                setExistingRegistration(existingReg);
                                setRegistration(existingReg);

                                let ticketId = existingTicketId;
                                if (existingData.ticket?.qr_data) {
                                    try {
                                        const qrData = JSON.parse(existingData.ticket.qr_data);
                                        ticketId = qrData.ticket_id || ticketId;
                                    } catch {
                                        // Use existing ticket ID
                                    }
                                }

                                if (existingRegistrationId && ticketId) {
                                    const existingTicket: Ticket = {
                                        ticketId,
                                        eventId: event.$id,
                                        eventTitle: event.title,
                                        eventDate: event.date,
                                        eventVenue: event.venue,
                                        userId: user.id || '',
                                        userName: user.name || data.name || '',
                                        userEmail: user.email || data.email || '',
                                        registrationId: existingRegistrationId,
                                        status: 'confirmed',
                                        qrCodeData: ticketId,
                                        createdAt: existingData.ticket?.created_at || existingData.registration.created_at || new Date().toISOString(),
                                    };
                                    setTicket(existingTicket);
                                    setCurrentStep('success');
                                    toast.success('You are already registered. Showing your ticket.');
                                    return;
                                }
                            }
                        }
                    } catch (fetchExistingError) {
                        console.error('Failed to fetch existing registration after duplicate', fetchExistingError);
                    }
                }
                throw new Error(errorData.message || 'Registration failed');
            }

            const result = await response.json();

            // Construct Registration object from API response
            const registrationData: Registration = {
                $id: result.registration_id,
                $createdAt: new Date().toISOString(),
                $updatedAt: new Date().toISOString(),
                eventId: event.$id,
                userId: user.id || '',
                ticketId: result.ticket_id || '',
                status: result.payment_required ? 'pending' : 'confirmed',
                paymentStatus: result.payment_required ? 'pending' : 'not_required',
                paymentAmount: result.amount,
                formData: data as Record<string, unknown>,
            };
            setRegistration(registrationData);

            // For paid events, store payment data for PaymentModal and advance to payment step
            if (result.payment_required && result.payment) {
                setPaymentData(result.payment);
                setCurrentStep('payment');
            } else if (!result.payment_required && result.ticket_id) {
                // For free events, construct Ticket object
                const ticketData: Ticket = {
                    ticketId: result.ticket_id,
                    eventId: event.$id,
                    eventTitle: event.title,
                    eventDate: event.date,
                    eventVenue: event.venue,
                    userId: user.id || '',
                    userName: user.name || data.name || '',
                    userEmail: user.email || data.email || '',
                    registrationId: result.registration_id,
                    status: 'confirmed',
                    qrCodeData: result.ticket_id,
                    createdAt: new Date().toISOString(),
                };
                setTicket(ticketData);
                setCurrentStep('success');
                toast.success('Registration successful!');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Registration failed';
            setError(message);
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePaymentComplete = useCallback(async (transactionId: string) => {
        if (registration) {
            setRegistration({
                ...registration,
                paymentStatus: 'completed',
                paymentTransactionId: transactionId,
                status: 'confirmed',
            });

            // Mark payment as completed on backend and create ticket
            try {
                const completeResponse = await fetch(`/api/admin/registrations/${registration.$id}/complete-payment`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                });

                if (!completeResponse.ok) {
                    throw new Error('Failed to complete payment on backend');
                }

                const completeData = await completeResponse.json();
                const ticketId = completeData.ticket_id;

                // Fetch full ticket details
                const ticketResponse = await fetch(`/api/registrations/${registration.$id}`, {
                    credentials: 'include',
                });
                
                if (ticketResponse.ok) {
                    const data = await ticketResponse.json();
                    if (data.event) {
                        const ticketData: Ticket = {
                            ticketId,
                            eventId: data.event.id,
                            eventTitle: data.event.title,
                            eventDate: data.event.date,
                            eventVenue: data.event.venue,
                            userId: user?.id || '',
                            userName: user?.name || '',
                            userEmail: user?.email || '',
                            registrationId: registration.$id,
                            status: 'confirmed',
                            qrCodeData: ticketId,
                            createdAt: data.ticket?.created_at || new Date().toISOString(),
                        };
                        setTicket(ticketData);
                    }
                }
            } catch (err) {
                console.error('Failed to complete payment', err);
                toast.error('Payment confirmed but ticket generation failed. Please contact support.');
            }
        }
        setCurrentStep('success');
        toast.success('Payment successful! Your ticket is ready.');
    }, [registration, user]);

    const handlePaymentError = useCallback((errorMessage: string) => {
        setError(errorMessage);
        toast.error(errorMessage);
    }, []);

    const handleClose = useCallback(() => {
        // Reset state
        setCurrentStep('auth');
        setFormTemplate(null);
        setFormData(null);
        setRegistration(null);
        setTicket(null);
        setError(null);
        setExistingRegistration(null);
        onClose();
    }, [onClose]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            handleClose();
        }
    }, [handleClose]);

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, handleKeyDown]);

    if (!event) return null;

    const renderStepContent = () => {
        switch (currentStep) {
            case 'auth':
                return (
                    <AuthStep
                        onLogin={handleLogin}
                        isLoading={isLoading || authLoading}
                    />
                );

            case 'form':
                return (
                    <DynamicRegistrationForm
                        event={event}
                        template={formTemplate}
                        onSubmit={handleFormSubmit}
                        isLoading={isLoading}
                        initialData={user ? {
                            name: user.name || '',
                            email: user.email || '',
                        } : undefined}
                    />
                );

            case 'payment':
                return registration && paymentData && (
                    <PaymentModal
                        event={event}
                        registration={registration}
                        paymentData={paymentData}
                        onPaymentComplete={handlePaymentComplete}
                        onError={handlePaymentError}
                    />
                );

            case 'success':
                if (!ticket) {
                    return (
                        <div className="flex flex-col items-center justify-center p-8 text-center">
                            <p className="text-gray-500">Loading your ticket...</p>
                        </div>
                    );
                }
                return (
                    <TicketDisplay
                        ticket={ticket}
                        event={event}
                        onClose={handleClose}
                    />
                );

            default:
                return null;
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop + centering container */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                        onClick={handleClose}
                        className="fixed inset-0 z-[200] bg-black/20 backdrop-blur-xl flex items-end sm:items-center justify-center p-0 sm:p-6"
                    >
                        {/* Modal */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 30 }}
                            transition={{ type: 'spring', damping: 28, stiffness: 280, mass: 0.8 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full sm:max-w-[520px] h-[92vh] sm:h-auto sm:max-h-[85vh] bg-white/95 sm:rounded-[40px] rounded-t-[40px] overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1),0_0_0_1px_rgba(255,255,255,0.8)_inset] flex flex-col border border-white/40 ring-1 ring-black/[0.03]"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-7 py-6 bg-white/80 backdrop-blur-2xl z-10 border-b border-gray-100/50 sticky top-0">
                                <div className="flex items-center gap-4">
                                    {currentStep !== 'auth' && currentStep !== 'success' && (
                                        <button
                                            onClick={() => {
                                                if (currentStep === 'form') {
                                                    handleClose();
                                                } else if (currentStep === 'payment') {
                                                    setCurrentStep('form');
                                                }
                                            }}
                                            className="p-2 -ml-2 hover:bg-gray-100/80 active:bg-gray-200/80 rounded-full transition-all duration-200 group"
                                            aria-label="Go back"
                                        >
                                            <ChevronLeft className="w-5 h-5 text-gray-500 group-hover:text-gray-900 group-hover:-translate-x-0.5 transition-transform" />
                                        </button>
                                    )}
                                    <div className="flex flex-col">
                                        <h2 className="font-semibold text-gray-900 text-[18px] tracking-tight line-clamp-1 leading-tight">
                                            {currentStep === 'success' ? 'Your Ticket' : 'Registration'}
                                        </h2>
                                        <p className="text-[13px] font-medium text-gray-500 tracking-wide line-clamp-1 mt-0.5">
                                            {event.title}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleClose}
                                    className="p-2.5 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 rounded-full transition-all duration-200 group hover:scale-105 active:scale-95"
                                    aria-label="Close"
                                >
                                    <X className="w-4 h-4 text-gray-500 group-hover:text-gray-900" />
                                </button>
                            </div>

                            {/* Step Indicator */}
                            {currentStep !== 'auth' && currentStep !== 'success' && (
                                <StepIndicator currentStep={currentStep} isPaidEvent={isPaidEvent} />
                            )}

                            {/* Error Message */}
                            <AnimatePresence>
                                {error && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="px-6 py-3 bg-red-50/80 border-b border-red-100 backdrop-blur-sm"
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="w-1 h-4 bg-red-500 rounded-full" />
                                            <p className="text-[13px] font-medium text-red-700">{error}</p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto sm:scrollbar-hide pb-2">
                                {isLoading && currentStep !== 'form' && currentStep !== 'payment' ? (
                                    <div className="flex items-center justify-center h-full min-h-[400px]">
                                        <div className="flex flex-col items-center gap-5">
                                            <motion.div 
                                                animate={{ rotate: 360 }}
                                                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                                                className="w-14 h-14 rounded-full border-[3px] border-gray-100/50 relative" 
                                            >
                                                <motion.div 
                                                    animate={{ rotate: -360 }}
                                                    transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                                                    className="w-14 h-14 rounded-full border-[3px] border-transparent border-t-ieee-blue absolute inset-0" 
                                                />
                                                <div className="absolute w-2 h-2 bg-ieee-blue rounded-full shadow-[0_0_10px_rgba(0,98,155,0.5)]" />
                                            </motion.div>
                                            <motion.p 
                                                animate={{ opacity: [0.5, 1, 0.5] }}
                                                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                                                className="text-[13px] font-medium text-gray-500 tracking-[0.1em] uppercase"
                                            >
                                                Loading Context
                                            </motion.p>
                                        </div>
                                    </div>
                                ) : (
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={currentStep}
                                            initial={{ opacity: 0, y: 15, scale: 0.98, filter: 'blur(8px)' }}
                                            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                                            exit={{ opacity: 0, y: -15, scale: 0.98, filter: 'blur(8px)' }}
                                            transition={{ type: 'spring', damping: 25, stiffness: 220, mass: 0.5 }}
                                            className="h-full flex-1 w-full"
                                        >
                                            {renderStepContent()}
                                        </motion.div>
                                    </AnimatePresence>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
