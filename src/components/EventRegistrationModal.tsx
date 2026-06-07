'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useScrollLock } from '@/hooks/useScrollLock';
import {
    RegistrationStep,
    Registration,
    Ticket,
    FormTemplate,
    RegistrationData
} from '@/types/registration';
import type { Event as AppEvent } from '@/types';
import { apiFetch } from '@/lib/api';
import DynamicRegistrationForm from './DynamicRegistrationForm';
import PaymentModal, { PaymentData } from './PaymentModal';
import TicketDisplay from './TicketDisplay';
import GoogleLoginButton from './GoogleLoginButton';
import toast from 'react-hot-toast';

interface EventRegistrationModalProps {
    event: AppEvent | null;
    isOpen: boolean;
    onClose: () => void;
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

            <GoogleLoginButton
                variant="full-width"
                className="max-w-[320px]"
                onLogin={onLogin}
            />
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
    const { user, status: authStatus, signIn } = useAuth();
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

    const buildFormTemplate = useCallback((apiTemplate: Record<string, unknown>, eventTitle?: string): FormTemplate => {
        const questions = (apiTemplate.questions || []) as {
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
        }[];

        return {
            eventId: event!.id,
            title: eventTitle || 'Registration Form',
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
            customQuestions: questions.map((q) => ({
                id: q.id,
                type: q.type as 'text' | 'email' | 'phone' | 'number' | 'select' | 'textarea' | 'checkbox' | 'radio',
                label: q.label,
                placeholder: q.placeholder,
                required: q.required || false,
                options: q.options,
                validation: q.validation,
            })),
        };
    }, [event]);

    const fetchFormTemplate = useCallback(async () => {
        if (!event) return;

        const propTemplate = event.formTemplate as Record<string, unknown> | undefined;
        if (propTemplate && propTemplate.questions) {
            setFormTemplate(buildFormTemplate(propTemplate, event.title));
            return;
        }

        setFormTemplate(getDefaultTemplate(event.id));
    }, [event, buildFormTemplate]);

    // Check existing registration and determine initial step
    useEffect(() => {
        if (!isOpen || !event) return;

        let cancelled = false;

        const checkExistingRegistration = async () => {
            if (event.registrationOpen === false) {
                if (!cancelled) {
                    setCurrentStep('form');
                    setError('Registrations are currently closed for this event.');
                }
                return;
            }
            if (!user) {
                if (!cancelled) {
                    setCurrentStep('auth');
                }
                return;
            }

            if (cancelled) return;
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
                const response = await fetch(`/api/registrations?eventId=${event.id}`, {
                    credentials: 'include',
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.docs && data.docs.length > 0) {
                        if (cancelled) return;
                        const registrationDoc = data.docs[0];
                        setExistingRegistration(registrationDoc);

                        const registrationId = registrationDoc.id;
                        let ticketId = registrationDoc.ticket?.id || '';
                        let ticketCreatedAt = (registrationDoc.createdAt as string) || new Date().toISOString();

                        if (registrationId && ticketId) {
                            const ticketData: Ticket = {
                                ticketId,
                                eventId: event.id,
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

                            if (cancelled) return;
                            setTicket(ticketData);
                            setCurrentStep('success');
                            return;
                        }
                    }
                }

                // Fetch form template
                if (cancelled) return;
                await fetchFormTemplate();
                setCurrentStep('form');
            } catch (err) {
                console.error('Error checking registration', err);
                // Proceed to form anyway
                if (!cancelled) {
                    await fetchFormTemplate();
                    setCurrentStep('form');
                }
            } finally {
                if (cancelled) return;
                setIsLoading(false);
            }
        };

        checkExistingRegistration();

        return () => { cancelled = true; };
    }, [isOpen, event, user, fetchFormTemplate]);

    const handleLogin = async () => {
        setIsLoading(true);
        signIn();
    };

    const handleFormSubmit = async (data: RegistrationData) => {
        if (!event || !user) return;
        if (event.registrationOpen === false) {
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
            // Submit registration. Validation, capacity, dedupe, and free-event
            // auto-confirm are handled by the beforeChange hook on Registrations.
            const response = await fetch('/api/registrations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    eventId: event.id,
                    ...data,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Registration failed');
            }

            const result = await response.json();

            // Construct Registration object from API response
            const registrationData: Registration = {
                id: result.registrationId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                eventId: event.id,
                userId: user.id || '',
                ticketId: result.ticketId || '',
                status: result.paymentRequired ? 'pending' : 'confirmed',
                paymentStatus: result.paymentRequired ? 'pending' : 'not_required',
                paymentAmount: result.amount,
                formData: data as Record<string, unknown>,
            };
            setRegistration(registrationData);

            // For paid events, store payment data for PaymentModal and advance to payment step
            if (result.paymentRequired && result.payment) {
                setPaymentData(result.payment);
                setCurrentStep('payment');
            } else if (!result.paymentRequired && result.ticketId) {
                // For free events, construct Ticket object
                const ticketData: Ticket = {
                    ticketId: result.ticketId,
                    eventId: event.id,
                    eventTitle: event.title,
                    eventDate: event.date,
                    eventVenue: event.venue,
                    userId: user.id || '',
                    userName: user.name || data.name || '',
                    userEmail: user.email || data.email || '',
                    registrationId: result.registrationId,
                    status: 'confirmed',
                    qrCodeData: result.ticketId,
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
        if (registration && event) {
            setRegistration({
                ...registration,
                paymentStatus: 'paid',
                paymentTransactionId: transactionId,
                status: 'confirmed',
            });

            // PATCH the registration: the chair access control + sendConfirmation
            // hook will auto-generate the ticket and email.
            try {
                const updated = await apiFetch<{
                    id: string;
                    ticket?: { ticket_id?: string };
                    errors?: Array<{ message: string }>;
                }>(
                    `/api/registrations/${registration.id}`,
                    {
                        method: 'PATCH',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            paymentStatus: 'paid',
                            registrationStatus: 'confirmed',
                            paymentAmount: registration.paymentAmount,
                            paymentTicketId: String(transactionId),
                        }),
                    }
                );

                if (updated.errors?.length) {
                    throw new Error(updated.errors[0].message);
                }

                const ticketId = updated.ticket?.ticket_id || registration.ticketId || '';
                if (ticketId) {
                    const ticketData: Ticket = {
                        ticketId,
                        eventId: event.id,
                        eventTitle: event.title,
                        eventDate: event.date,
                        eventVenue: event.venue,
                        userId: user?.id || '',
                        userName: user?.name || '',
                        userEmail: user?.email || '',
                        registrationId: registration.id,
                        status: 'confirmed',
                        qrCodeData: ticketId,
                        createdAt: new Date().toISOString(),
                    };
                    setTicket(ticketData);
                }
            } catch (err) {
                console.error('Failed to complete payment', err);
                toast.error('Payment confirmed but ticket generation failed. Please contact support.');
            }
        }
        setCurrentStep('success');
        toast.success('Payment successful! Your ticket is ready.');
    }, [registration, event, user]);

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
