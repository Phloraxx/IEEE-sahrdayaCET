'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Clock, 
    Copy, 
    Check, 
    RefreshCw, 
    Smartphone, 
    AlertTriangle,
    IndianRupee,
    Loader2,
    QrCode,
    ExternalLink
} from 'lucide-react';
import { generateQRDataUrl } from '@/lib/qr';
import type { Event } from '@/types';
import type { Registration } from '@/types/registration';

// Payment data returned from the registration API
export interface PaymentData {
    ticketId: string;
    amount: number;
    status: string;
    createdAt: string;
    upiString: string;
    upiId: string;
    merchantName: string;
    statusUrl: string;
}

interface PaymentModalProps {
    event: Event;
    registration: Registration;
    paymentData?: PaymentData;
    onPaymentComplete: (transactionId: string | number) => void;
    onError: (message: string) => void;
}

// Simple QR Code generator using shared utility
const QRCodeCanvas: React.FC<{
    data: string;
    size?: number;
}> = ({ data, size = 200 }) => {
    const [dataUrl, setDataUrl] = useState<string | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!data) return;

        generateQRDataUrl(data, {
            width: size,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF',
            },
        })
            .then(setDataUrl)
            .catch((err) => {
                console.error('QR generation error', err);
                setError(true);
            });
    }, [data, size]);

    return (
        <div className="relative">
            {dataUrl ? (
                <img
                    src={dataUrl}
                    width={size}
                    height={size}
                    alt="UPI QR Code"
                    className="rounded-xl"
                />
            ) : (
                <div
                    className="rounded-xl bg-gray-100 flex items-center justify-center"
                    style={{ width: size, height: size }}
                >
                    <Loader2 className="w-8 h-8 text-ieee-blue animate-spin" />
                </div>
            )}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-xl">
                    <span className="text-xs text-gray-500">Failed to generate QR</span>
                </div>
            )}
        </div>
    );
};

// Payment timer component
const PaymentTimer: React.FC<{
    expiresAt: number;
    onExpire: () => void;
}> = ({ expiresAt, onExpire }) => {
    const [timeLeft, setTimeLeft] = useState<number>(0);

    useEffect(() => {
        const updateTimer = () => {
            const now = Date.now();
            const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
            setTimeLeft(remaining);

            if (remaining <= 0) {
                onExpire();
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);

        return () => clearInterval(interval);
    }, [expiresAt, onExpire]);

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const isWarning = timeLeft <= 60;

    return (
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-bold tracking-wide border ${
            isWarning 
                ? 'bg-red-500/10 text-red-200 border-red-500/20' 
                : 'bg-white/10 text-white border-white/20'
        }`}>
            <Clock className={`w-3.5 h-3.5 ${isWarning ? 'animate-pulse text-red-400' : 'text-white/80'}`} />
            <span className="font-mono tabular-nums leading-none mt-0.5">
                {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
            </span>
        </div>
    );
};

export default function PaymentModal({
    event,
    registration,
    paymentData,
    onPaymentComplete,
    onError,
}: PaymentModalProps) {
    const [paymentStatus, setPaymentStatus] = useState<'pending' | 'checking' | 'completed' | 'expired' | 'failed'>('pending');
    const [copied, setCopied] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);
    
    const UPI_ID = paymentData?.upiId || process.env.NEXT_PUBLIC_UPI_ID || 'ieee.sahrdaya@upi';
    const MERCHANT_NAME = paymentData?.merchantName || process.env.NEXT_PUBLIC_MERCHANT_NAME || 'IEEE Sahrdaya SB';
    const PAYMENT_TIMEOUT = 5 * 60 * 1000;
    
    const paymentCreatedAt = paymentData?.createdAt ? new Date(paymentData.createdAt).getTime() : Date.now();
    
    const expiresAtRef = useRef<number>(paymentCreatedAt + PAYMENT_TIMEOUT);
    const expiresAt = expiresAtRef.current;

    const paymentTicketId = paymentData?.ticketId;
    const paymentRef = paymentTicketId || `IEEE-${String(registration.id).slice(-8).toUpperCase()}`;
    
    const paymentAmount = paymentData?.amount ?? event.price;

    const upiString = paymentData?.upiString || 
        `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(MERCHANT_NAME)}&am=${paymentAmount}&tn=${paymentRef}&cu=INR`;

    const copiedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleCopyUPI = async () => {
        try {
            await navigator.clipboard.writeText(UPI_ID);
            setCopied(true);
            if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
            copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy to clipboard', err);
        }
    };

    const handleOpenUPIApp = () => {
        window.location.href = upiString;
    };

    const checkPaymentStatus = useCallback(async () => {
        if (paymentStatus === 'completed' || paymentStatus === 'expired') return;

        setPaymentStatus('checking');

        try {
            // First, try the payment gateway status endpoint if we have a ticket ID
            if (paymentData?.statusUrl) {
                const paymentResponse = await fetch(paymentData.statusUrl);
                if (paymentResponse.ok) {
                    const data = await paymentResponse.json();
                    if (data.status === 'paid' || data.paidAt) {
                        setPaymentStatus('completed');
                        onPaymentComplete(paymentTicketId || registration.id);
                        if (pollingRef.current) {
                            clearInterval(pollingRef.current);
                        }
                        return;
                    } else if (data.status === 'cancelled') {
                        setPaymentStatus('expired');
                        if (pollingRef.current) {
                            clearInterval(pollingRef.current);
                        }
                        onError('Payment session expired. Please try again.');
                        return;
                    }
                }
            }

            // Fallback: Check local registration status
            const response = await fetch(`/api/registrations/${registration.id}`, {
                credentials: 'include',
            });
            
            if (!response.ok) {
                throw new Error('Failed to check payment status');
            }

            const data = await response.json();
            const regPaymentStatus = data.registration?.paymentStatus;

            if (regPaymentStatus === 'completed') {
                setPaymentStatus('completed');
                onPaymentComplete(data.ticket?.id || registration.id);
                if (pollingRef.current) {
                    clearInterval(pollingRef.current);
                }
            } else if (regPaymentStatus === 'failed') {
                setPaymentStatus('failed');
                onError('Payment failed. Please try again.');
                if (pollingRef.current) {
                    clearInterval(pollingRef.current);
                }
            } else {
                setPaymentStatus('pending');
            }
        } catch (err) {
            console.error('Error checking payment', err);
            setPaymentStatus('pending');
        }
    }, [registration.id, paymentStatus, paymentData?.statusUrl, paymentTicketId, onPaymentComplete, onError]);

    // Use ref to avoid stale closure in polling effect
    const checkPaymentStatusRef = useRef(checkPaymentStatus);
    checkPaymentStatusRef.current = checkPaymentStatus;

    // Start polling for payment status
    useEffect(() => {
        pollingRef.current = setInterval(() => checkPaymentStatusRef.current(), 5000);

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
            }
            if (copiedTimeoutRef.current) {
                clearTimeout(copiedTimeoutRef.current);
            }
        };
    }, []);

    const handleExpire = useCallback(() => {
        setPaymentStatus('expired');
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
        }
        onError('Payment session expired. Please try again.');
    }, [onError]);

    const handleRetry = () => {
        expiresAtRef.current = Date.now() + PAYMENT_TIMEOUT;
        setRetryCount(prev => prev + 1);
        setPaymentStatus('pending');
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
        }
        pollingRef.current = setInterval(() => checkPaymentStatusRef.current(), 5000);
    };

    if (paymentStatus === 'completed') {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-16 px-6 text-center"
            >
                <div className="relative mb-8">
                    <div className="absolute inset-0 bg-green-400/20 rounded-full blur-xl animate-pulse" />
                    <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                        className="relative w-24 h-24 bg-gradient-to-tr from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30"
                    >
                        <Check className="w-12 h-12 text-white" strokeWidth={3} />
                    </motion.div>
                </div>
                <h3 className="text-[22px] font-bold tracking-tight text-gray-900 mb-2">
                    Payment Successful
                </h3>
                <p className="text-[14px] text-gray-500 max-w-[260px] leading-relaxed">
                    Your registration is confirmed. Preparing your secure digital ticket...
                </p>
                <Loader2 className="w-6 h-6 text-green-500 animate-spin mt-8" />
            </motion.div>
        );
    }

    if (paymentStatus === 'expired' || paymentStatus === 'failed') {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-16 px-6 text-center"
            >
                <div className="relative mb-8">
                    <div className="absolute inset-0 bg-red-400/20 rounded-full blur-xl animate-pulse" />
                    <div className="relative w-24 h-24 bg-gradient-to-tr from-red-500 to-rose-400 rounded-full flex items-center justify-center shadow-lg shadow-red-500/30">
                        <AlertTriangle className="w-12 h-12 text-white" strokeWidth={2.5} />
                    </div>
                </div>
                <h3 className="text-[22px] font-bold tracking-tight text-gray-900 mb-2">
                    {paymentStatus === 'expired' ? 'Payment Session Expired' : 'Payment Failed'}
                </h3>
                <p className="text-[14px] text-gray-500 max-w-[260px] leading-relaxed mb-8">
                    {paymentStatus === 'expired' 
                        ? 'The payment window has closed to ensure secure transactions.'
                        : 'We couldn\'t process your payment. Your account has not been charged.'}
                </p>
                <button
                    onClick={handleRetry}
                    className="flex items-center justify-center gap-2.5 w-full py-4 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold text-[15px] transition-all shadow-md hover:shadow-xl"
                >
                    <RefreshCw className="w-4 h-4" />
                    Try Payment Again
                </button>
            </motion.div>
        );
    }

    return (
        <div className="p-5 sm:p-7 space-y-6">
            {/* Payment Info Header */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-[24px] p-6 shadow-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 group-hover:bg-ieee-blue/10 transition-colors duration-700" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-ieee-blue/20 rounded-full blur-2xl translate-y-1/3 -translate-x-1/3 group-hover:bg-ieee-light-blue/20 transition-colors duration-700" />
                
                <div className="relative z-10 flex items-center justify-between mb-4">
                    <span className="text-gray-300 text-[13px] font-medium tracking-wide uppercase">Total to Pay</span>
                    <PaymentTimer 
                        expiresAt={expiresAtRef.current} 
                        onExpire={handleExpire} 
                    />
                </div>
                <div className="relative z-10 flex items-end gap-1 mb-1">
                    <span className="text-white/60 text-xl font-medium mb-1.5">₹</span>
                    <span className="text-white text-[42px] font-bold leading-none tracking-tight">{paymentAmount}</span>
                </div>
                <div className="relative z-10 flex items-center justify-between mt-5 pt-4 border-t border-white/10">
                    <p className="text-white/50 text-[11px] font-mono tracking-wider truncate mr-4">
                        REF: {paymentRef}
                    </p>
                    <div className="flex bg-white/10 px-2 py-1 rounded text-white/80 text-[10px] uppercase font-bold tracking-wider relative overflow-hidden group-hover:bg-white/20 transition-colors">
                        Secure
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]" />
                    </div>
                </div>
            </div>

            {/* QR Code Section */}
            <div className="flex flex-col items-center">
                <div className="bg-white p-5 rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-gray-100/80 mb-4 transition-transform hover:scale-[1.02] duration-300">
                    <QRCodeCanvas data={upiString} size={220} />
                </div>
                <div className="flex items-center gap-2 text-gray-500 bg-gray-50 px-4 py-2 rounded-full border border-gray-100">
                    <QrCode className="w-4 h-4 text-ieee-blue" />
                    <p className="text-[13px] font-medium">
                        Scan with any UPI app
                    </p>
                </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4">
                <div className="h-px flex-grow bg-gradient-to-r from-transparent via-gray-200 to-gray-200" />
                <span className="text-[11px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-md tracking-widest">OR</span>
                <div className="h-px flex-grow bg-gradient-to-l from-transparent via-gray-200 to-gray-200" />
            </div>

            {/* UPI ID Copy Section */}
            <div className="space-y-3">
                <div className="group relative flex items-center gap-3 p-1.5 pl-5 bg-white rounded-2xl border border-gray-200 hover:border-ieee-blue/40 shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="flex-1 py-2 overflow-hidden">
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">UPI ID</p>
                        <p className="font-mono text-[14px] font-medium text-gray-900 truncate">{UPI_ID}</p>
                    </div>
                    <button
                        onClick={handleCopyUPI}
                        className="p-3.5 bg-gray-50 hover:bg-ieee-blue group-hover:bg-gray-100 rounded-xl transition-colors shrink-0 outline-none focus:ring-2 focus:ring-ieee-blue/50"
                        title="Copy UPI ID"
                    >
                        <AnimatePresence mode="wait">
                            {copied ? (
                                <motion.div
                                    key="check"
                                    initial={{ scale: 0, rotate: -45 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    exit={{ scale: 0, rotate: 45 }}
                                    className="text-green-600"
                                >
                                    <Check className="w-5 h-5" strokeWidth={2.5} />
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="copy"
                                    initial={{ scale: 0, rotate: 45 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    exit={{ scale: 0, rotate: -45 }}
                                    className="text-gray-500 group-hover:text-ieee-blue"
                                >
                                    <Copy className="w-5 h-5" strokeWidth={2} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </button>
                </div>

                {/* Open UPI App Button (Mobile) */}
                <button
                    onClick={handleOpenUPIApp}
                    className="w-full flex items-center justify-center gap-2.5 py-4 px-4 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold text-[14px] transition-all duration-300 shadow-[0_8px_16px_rgba(0,0,0,0.1)] hover:shadow-[0_12px_24px_rgba(0,0,0,0.15)] sm:hidden"
                >
                    <Smartphone className="w-5 h-5" />
                    Open UPI App on Device
                    <ExternalLink className="w-4 h-4 ml-1 opacity-70" />
                </button>
            </div>

            {/* Payment Status */}
            <div className="flex items-center justify-center gap-3 py-3.5 bg-amber-50 rounded-2xl border border-amber-200/60 shadow-inner">
                <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
                <span className="text-[13px] text-amber-800 font-semibold tracking-wide">
                    {paymentStatus === 'checking' ? 'Processing Transaction...' : 'Awaiting Payment...'}
                </span>
            </div>

            {/* Manual Verification Button */}
            <button
                onClick={checkPaymentStatus}
                disabled={paymentStatus === 'checking'}
                className="w-full text-[13px] text-gray-500 hover:text-gray-800 font-medium transition-colors disabled:opacity-50 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-600 mt-2"
            >
                {paymentStatus === 'checking' ? 'Please wait...' : 'I completed the payment but haven\'t received confirmation'}
            </button>
        </div>
    );
}
