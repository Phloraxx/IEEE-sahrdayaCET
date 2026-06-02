'use client';

import React, { useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm, Controller, FieldErrors, FieldValues, UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, User, Mail, Phone, BookOpen, Building2, Users, Hash, AlertCircle } from 'lucide-react';
import { Event, Society } from '@/types';
import { 
    FormTemplate,
    RegistrationData, 
    DEPARTMENTS, 
    SEMESTERS, 
    SECTIONS 
} from '@/types/registration';

interface DynamicRegistrationFormProps {
    event: Event & { society?: Society };
    template: FormTemplate | null;
    onSubmit: (data: RegistrationData) => void;
    isLoading: boolean;
    initialData?: Partial<RegistrationData>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRegister = UseFormRegister<any>;

// Input field component
const FormInput: React.FC<{
    id: string;
    label: string;
    type?: string;
    placeholder?: string;
    required?: boolean;
    icon?: React.ReactNode;
    error?: string;
    register: AnyRegister;
    disabled?: boolean;
}> = ({ id, label, type = 'text', placeholder, required, icon, error, register, disabled }) => (
    <div className="relative group">
        <label htmlFor={id} className={`block text-[13px] font-semibold mb-1.5 transition-colors duration-200 ${error ? 'text-red-500' : disabled ? 'text-gray-400' : 'text-gray-700 group-focus-within:text-ieee-blue'}`}>
            {label} {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <div className="relative flex items-center">
            {icon && (
                <div className={`absolute left-4 z-10 transition-colors duration-200 ${error ? 'text-red-400' : disabled ? 'text-gray-300' : 'text-gray-400 group-focus-within:text-ieee-blue'}`}>
                    {icon}
                </div>
            )}
            <input
                id={id}
                type={type}
                placeholder={placeholder}
                disabled={disabled}
                {...register(id)}
                className={`
                    w-full px-4 py-3.5 rounded-2xl border-2 bg-transparent transition-all duration-300
                    ${icon ? 'pl-[44px]' : ''}
                    ${error 
                        ? 'border-red-300 focus:border-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.05)]' 
                        : 'border-gray-200 focus:border-ieee-blue hover:border-gray-300 focus:shadow-[0_0_0_4px_rgba(0,98,155,0.08)]'
                    }
                    focus:outline-none focus:bg-white
                    disabled:bg-gray-50 disabled:border-gray-100 disabled:cursor-not-allowed disabled:text-gray-500
                    text-gray-900 text-[15px] font-medium placeholder:text-gray-400 placeholder:font-normal
                `}
            />
        </div>
        <AnimatePresence>
            {error && (
                <motion.p
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 6 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    className="text-[13px] font-medium text-red-500 flex items-center gap-1.5 px-1 origin-top"
                >
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {error}
                </motion.p>
            )}
        </AnimatePresence>
    </div>
);

// Select field component
const FormSelect: React.FC<{
    id: string;
    label: string;
    options: readonly string[];
    required?: boolean;
    icon?: React.ReactNode;
    error?: string;
    register: AnyRegister;
    placeholder?: string;
}> = ({ id, label, options, required, icon, error, register, placeholder = 'Select...' }) => (
    <div className="relative group">
        <label htmlFor={id} className={`block text-[13px] font-semibold mb-1.5 transition-colors duration-200 ${error ? 'text-red-500' : 'text-gray-700 group-focus-within:text-ieee-blue'}`}>
            {label} {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <div className="relative flex items-center">
            {icon && (
                <div className={`absolute left-4 z-10 transition-colors duration-200 pointer-events-none ${error ? 'text-red-400' : 'text-gray-400 group-focus-within:text-ieee-blue'}`}>
                    {icon}
                </div>
            )}
            <select
                id={id}
                {...register(id)}
                className={`
                    w-full px-4 py-3.5 rounded-2xl border-2 bg-transparent transition-all duration-300 appearance-none
                    ${icon ? 'pl-[44px]' : ''}
                    ${error 
                        ? 'border-red-300 focus:border-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.05)] text-red-900' 
                        : 'border-gray-200 focus:border-ieee-blue hover:border-gray-300 focus:shadow-[0_0_0_4px_rgba(0,98,155,0.08)] text-gray-900'
                    }
                    focus:outline-none focus:bg-white
                    text-[15px] font-medium cursor-pointer
                `}
            >
                <option value="" disabled className="text-gray-400 font-normal">{placeholder}</option>
                {options.map((option) => (
                    <option key={option} value={option} className="text-gray-900 font-medium">
                        {option}
                    </option>
                ))}
            </select>
            <div className="absolute right-4 transition-transform duration-300 pointer-events-none group-focus-within:-rotate-180 text-gray-400 group-focus-within:text-ieee-blue">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        </div>
        <AnimatePresence>
            {error && (
                <motion.p
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 6 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    className="text-[13px] font-medium text-red-500 flex items-center gap-1.5 px-1 origin-top"
                >
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {error}
                </motion.p>
            )}
        </AnimatePresence>
    </div>
);

// Textarea field component
const FormTextarea: React.FC<{
    id: string;
    label: string;
    placeholder?: string;
    required?: boolean;
    error?: string;
    register: AnyRegister;
    rows?: number;
}> = ({ id, label, placeholder, required, error, register, rows = 3 }) => (
    <div className="relative group">
        <label htmlFor={id} className={`block text-[13px] font-semibold mb-1.5 transition-colors duration-200 ${error ? 'text-red-500' : 'text-gray-700 group-focus-within:text-ieee-blue'}`}>
            {label} {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <textarea
            id={id}
            rows={rows}
            placeholder={placeholder}
            {...register(id)}
            className={`
                w-full px-4 py-3.5 rounded-2xl border-2 bg-transparent transition-all duration-300 resize-none
                ${error 
                    ? 'border-red-300 focus:border-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.05)]' 
                    : 'border-gray-200 focus:border-ieee-blue hover:border-gray-300 focus:shadow-[0_0_0_4px_rgba(0,98,155,0.08)]'
                }
                focus:outline-none focus:bg-white
                text-[15px] font-medium placeholder:text-gray-400 placeholder:font-normal
            `}
        />
        <AnimatePresence>
            {error && (
                <motion.p
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 6 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    className="text-[13px] font-medium text-red-500 flex items-center gap-1.5 px-1 origin-top"
                >
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {error}
                </motion.p>
            )}
        </AnimatePresence>
    </div>
);

// Checkbox field component
const FormCheckbox: React.FC<{
    id: string;
    label: string;
    required?: boolean;
    error?: string;
    register: AnyRegister;
}> = ({ id, label, required, error, register }) => (
    <div className="relative">
        <label className="flex items-start gap-4 cursor-pointer group">
            <div className={`relative flex items-center justify-center w-5 h-5 mt-0.5 rounded-md border-2 transition-all duration-200 ${error ? 'border-red-400' : 'border-gray-300 group-hover:border-ieee-blue'}`}>
                <input
                    type="checkbox"
                    id={id}
                    {...register(id)}
                    className="peer absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="absolute inset-0 bg-ieee-blue scale-0 peer-checked:scale-100 transition-transform duration-200 rounded-[4px]" />
                <svg className="w-3.5 h-3.5 text-white absolute inset-0 m-auto scale-0 peer-checked:scale-100 transition-transform duration-200 delay-75 z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            </div>
            <span className="text-[14px] leading-relaxed text-gray-700 select-none">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
            </span>
        </label>
        <AnimatePresence>
            {error && (
                <motion.p
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 6 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    className="text-[13px] font-medium text-red-500 flex items-center gap-1.5 px-1 ml-9 origin-top"
                >
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {error}
                </motion.p>
            )}
        </AnimatePresence>
    </div>
);

// Radio field component
const FormRadio: React.FC<{
    id: string;
    label: string;
    options: string[];
    required?: boolean;
    error?: string;
    register: AnyRegister;
}> = ({ id, label, options, required, error, register }) => (
    <div className="relative">
        <label className={`block text-[13px] font-semibold mb-3 ${error ? 'text-red-500' : 'text-gray-700'}`}>
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {options.map((option) => (
                <label key={option} className={`
                    flex items-center gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition-all duration-200 group
                    ${error ? 'border-red-200 hover:border-red-300 bg-red-50/50' : 'border-gray-200 hover:border-ieee-blue/50 hover:bg-ieee-blue/5'}
                `}>
                    <div className="relative flex items-center justify-center w-5 h-5 rounded-full border-2 border-gray-300 group-hover:border-ieee-blue transition-colors">
                        <input
                            type="radio"
                            value={option}
                            {...register(id)}
                            className="peer absolute inset-0 opacity-0 cursor-pointer"
                        />
                        <div className="w-2.5 h-2.5 rounded-full bg-ieee-blue scale-0 peer-checked:scale-100 transition-transform duration-200" />
                    </div>
                    <span className="text-[14px] font-medium text-gray-800 select-none">{option}</span>
                </label>
            ))}
        </div>
        <AnimatePresence>
            {error && (
                <motion.p
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 6 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    className="text-[13px] font-medium text-red-500 flex items-center gap-1.5 px-1 origin-top"
                >
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {error}
                </motion.p>
            )}
        </AnimatePresence>
    </div>
);

export default function DynamicRegistrationForm({
    event,
    template,
    onSubmit,
    isLoading,
    initialData,
}: DynamicRegistrationFormProps) {
    // Build Zod schema dynamically
    const validationSchema = useMemo(() => {
        const schemaFields: Record<string, z.ZodTypeAny> = {};
        const standardFields = template?.standardFields;

        // Standard fields validation
        if (standardFields?.name) {
            schemaFields.name = z.string().min(2, 'Name must be at least 2 characters');
        }
        if (standardFields?.email) {
            schemaFields.email = z.string().email('Please enter a valid email address');
        }
        if (standardFields?.phone) {
            schemaFields.phone = z.string().regex(
                /^[6-9]\d{9}$/,
                'Please enter a valid 10-digit Indian phone number'
            );
        }
        if (standardFields?.semester) {
            schemaFields.semester = z.string().min(1, 'Please select a semester');
        }
        if (standardFields?.department) {
            schemaFields.department = z.string().min(1, 'Please select a department');
        }
        if (standardFields?.section) {
            schemaFields.section = z.string().min(1, 'Please select a section');
        }
        if (standardFields?.rollNumber) {
            schemaFields.rollNumber = z.string().min(1, 'Please enter your roll number');
        }

        // Custom fields validation
        template?.customQuestions.forEach((field) => {
            let fieldSchema: z.ZodTypeAny;

            switch (field.type) {
                case 'email':
                    fieldSchema = z.string().email(field.validation?.message || 'Invalid email');
                    break;
                case 'phone':
                    fieldSchema = z.string().regex(
                        /^[6-9]\d{9}$/,
                        field.validation?.message || 'Invalid phone number'
                    );
                    break;
                case 'number':
                    fieldSchema = z.coerce.number();
                    if (field.validation?.min !== undefined) {
                        fieldSchema = (fieldSchema as z.ZodNumber).min(field.validation.min);
                    }
                    if (field.validation?.max !== undefined) {
                        fieldSchema = (fieldSchema as z.ZodNumber).max(field.validation.max);
                    }
                    break;
                case 'checkbox':
                    fieldSchema = field.required 
                        ? z.boolean().refine(val => val === true, { message: 'This field is required' })
                        : z.boolean().optional();
                    break;
                default:
                    fieldSchema = z.string();
                    if (field.validation?.pattern) {
                        fieldSchema = (fieldSchema as z.ZodString).regex(
                            new RegExp(field.validation.pattern),
                            field.validation.message || 'Invalid format'
                        );
                    }
            }

            if (field.required && field.type !== 'checkbox') {
                fieldSchema = fieldSchema.refine(
                    (val) => val !== undefined && val !== null && val !== '',
                    { message: 'This field is required' }
                );
            } else if (!field.required) {
                fieldSchema = fieldSchema.optional();
            }

            schemaFields[`custom_${field.id}`] = fieldSchema;
        });

        return z.object(schemaFields);
    }, [template]);

    const {
        register: _register,
        handleSubmit,
        formState: { errors },
        control,
    } = useForm({
        defaultValues: {
            name: initialData?.name || '',
            email: initialData?.email || '',
            phone: initialData?.phone || '',
            semester: initialData?.semester || '',
            department: initialData?.department || '',
            section: initialData?.section || '',
            rollNumber: initialData?.rollNumber || '',
            ...Object.fromEntries(
                (template?.customQuestions || []).map((q) => [`custom_${q.id}`, ''])
            ),
        },
    });
    
    // Cast register to a generic type to avoid type conflicts with form components
    const register = _register as AnyRegister;

    const onFormSubmit = useCallback((data: Record<string, unknown>) => {
        // Separate standard fields from custom fields
        const standardData: RegistrationData = {
            name: data.name as string,
            email: data.email as string,
            phone: data.phone as string,
            semester: data.semester as string,
            department: data.department as string,
            section: data.section as string,
            rollNumber: data.rollNumber as string,
        };

        // Extract custom fields
        const customFields: Record<string, string | number | boolean> = {};
        Object.keys(data).forEach((key) => {
            if (key.startsWith('custom_')) {
                const fieldId = key.replace('custom_', '');
                customFields[fieldId] = data[key] as string | number | boolean;
            }
        });

        if (Object.keys(customFields).length > 0) {
            standardData.customFields = customFields;
        }

        onSubmit(standardData);
    }, [onSubmit]);

    const getError = (fieldName: string): string | undefined => {
        const error = errors[fieldName as keyof typeof errors];
        return error?.message as string | undefined;
    };

    const standardFields = template?.standardFields;

    return (
        <form onSubmit={handleSubmit(onFormSubmit)} className="p-5 sm:p-7 space-y-6">
            {/* Event Info Banner */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-ieee-blue via-ieee-light-blue to-ieee-blue opacity-80" />
                <div className="absolute -right-10 -top-10 w-32 h-32 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-colors duration-500" />
                
                <div className="flex items-start justify-between relative z-10 gap-4">
                    <div>
                        <h3 className="font-bold text-white text-[15px] sm:text-base leading-snug tracking-wide">
                            {event.title}
                        </h3>
                        <p className="text-[13px] text-gray-300 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="flex items-center gap-1 relative before:absolute before:-left-1.5 before:top-1/2 before:-translate-y-1/2 before:w-1 before:h-1 before:bg-ieee-light-blue before:rounded-full pl-2">
                                {new Date(event.date).toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                })}
                            </span>
                            {event.venue && (
                                <span className="flex items-center gap-1 relative before:absolute before:-left-1.5 before:top-1/2 before:-translate-y-1/2 before:w-1 before:h-1 before:bg-gray-500 before:rounded-full pl-2 text-gray-400">
                                    {event.venue}
                                </span>
                            )}
                        </p>
                    </div>
                    <div className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shadow-sm ${
                        event.price === 0 
                            ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-green-500/20' 
                            : 'bg-gradient-to-r from-ieee-blue to-ieee-light-blue text-white shadow-ieee-blue/20'
                    }`}>
                        {event.price === 0 ? 'FREE' : `₹${event.price}`}
                    </div>
                </div>
            </div>

            {/* Standard Fields */}
            <div className="space-y-5">
                {standardFields?.name && (
                    <FormInput
                        id="name"
                        label="Full Name"
                        placeholder="Enter your full name"
                        required
                        icon={<User className="w-4 h-4" />}
                        error={getError('name')}
                        register={register}
                    />
                )}

                {standardFields?.email && (
                    <FormInput
                        id="email"
                        label="Email Address"
                        type="email"
                        placeholder="you@example.com"
                        required
                        icon={<Mail className="w-4 h-4" />}
                        error={getError('email')}
                        register={register}
                        disabled={!!initialData?.email}
                    />
                )}

                {standardFields?.phone && (
                    <FormInput
                        id="phone"
                        label="Phone Number"
                        type="tel"
                        placeholder="9876543210"
                        required
                        icon={<Phone className="w-4 h-4" />}
                        error={getError('phone')}
                        register={register}
                    />
                )}

                <div className="grid grid-cols-2 gap-3">
                    {standardFields?.semester && (
                        <FormSelect
                            id="semester"
                            label="Semester"
                            options={SEMESTERS}
                            required
                            icon={<BookOpen className="w-4 h-4" />}
                            error={getError('semester')}
                            register={register}
                            placeholder="Select"
                        />
                    )}

                    {standardFields?.section && (
                        <FormSelect
                            id="section"
                            label="Section"
                            options={SECTIONS}
                            required
                            icon={<Users className="w-4 h-4" />}
                            error={getError('section')}
                            register={register}
                            placeholder="Select"
                        />
                    )}
                </div>

                {standardFields?.department && (
                    <FormSelect
                        id="department"
                        label="Department"
                        options={DEPARTMENTS}
                        required
                        icon={<Building2 className="w-4 h-4" />}
                        error={getError('department')}
                        register={register}
                        placeholder="Select your department"
                    />
                )}

                {standardFields?.rollNumber && (
                    <FormInput
                        id="rollNumber"
                        label="Roll Number"
                        placeholder="Enter your roll number"
                        required
                        icon={<Hash className="w-4 h-4" />}
                        error={getError('rollNumber')}
                        register={register}
                    />
                )}
            </div>

            {/* Custom Questions */}
            {template?.customQuestions && template.customQuestions.length > 0 && (
                <div className="pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-900 mb-4">
                        Additional Questions
                    </h4>
                    <div className="space-y-4">
                        {template.customQuestions.map((field) => {
                            const fieldId = `custom_${field.id}`;
                            const error = getError(fieldId);

                            switch (field.type) {
                                case 'select':
                                    return (
                                        <FormSelect
                                            key={field.id}
                                            id={fieldId}
                                            label={field.label}
                                            options={field.options || []}
                                            required={field.required}
                                            error={error}
                                            register={register}
                                            placeholder={field.placeholder}
                                        />
                                    );
                                case 'textarea':
                                    return (
                                        <FormTextarea
                                            key={field.id}
                                            id={fieldId}
                                            label={field.label}
                                            placeholder={field.placeholder}
                                            required={field.required}
                                            error={error}
                                            register={register}
                                        />
                                    );
                                case 'checkbox':
                                    return (
                                        <FormCheckbox
                                            key={field.id}
                                            id={fieldId}
                                            label={field.label}
                                            required={field.required}
                                            error={error}
                                            register={register}
                                        />
                                    );
                                case 'radio':
                                    return (
                                        <FormRadio
                                            key={field.id}
                                            id={fieldId}
                                            label={field.label}
                                            options={field.options || []}
                                            required={field.required}
                                            error={error}
                                            register={register}
                                        />
                                    );
                                default:
                                    return (
                                        <FormInput
                                            key={field.id}
                                            id={fieldId}
                                            label={field.label}
                                            type={field.type}
                                            placeholder={field.placeholder}
                                            required={field.required}
                                            error={error}
                                            register={register}
                                        />
                                    );
                            }
                        })}
                    </div>
                </div>
            )}

            {/* Terms & Conditions */}
            <div className="pt-6 mt-2 border-t border-gray-100">
                <label className="flex items-start gap-4 cursor-pointer group">
                    <div className="relative flex items-center justify-center w-5 h-5 mt-0.5 rounded-md border-2 border-gray-300 group-hover:border-ieee-blue transition-all duration-200">
                        <input
                            type="checkbox"
                            required
                            className="peer absolute inset-0 opacity-0 cursor-pointer"
                        />
                        <div className="absolute inset-0 bg-ieee-blue scale-0 peer-checked:scale-100 transition-transform duration-200 rounded-[4px]" />
                        <svg className="w-3.5 h-3.5 text-white absolute inset-0 m-auto scale-0 peer-checked:scale-100 transition-transform duration-200 delay-75 z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <span className="text-[13px] text-gray-500 leading-relaxed">
                        I confirm my details are correct and agree to the{' '}
                        <a href="#" className="font-semibold text-gray-900 hover:text-ieee-blue transition-colors underline decoration-gray-300 hover:decoration-ieee-blue underline-offset-2">Terms & Conditions</a>
                        {' '}and{' '}
                        <a href="#" className="font-semibold text-gray-900 hover:text-ieee-blue transition-colors underline decoration-gray-300 hover:decoration-ieee-blue underline-offset-2">Privacy Policy</a>.
                    </span>
                </label>
            </div>

            {/* Submit Button */}
            <motion.button
                type="submit"
                disabled={isLoading}
                whileHover={{ scale: isLoading ? 1 : 1.01, translateY: isLoading ? 0 : -2 }}
                whileTap={{ scale: isLoading ? 1 : 0.98 }}
                className={`
                    w-full py-4 mt-8 rounded-2xl font-bold text-[15px] tracking-wide text-white
                    flex items-center justify-center gap-2.5 overflow-hidden relative
                    transition-all duration-300
                    ${isLoading 
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                        : 'bg-gray-900 hover:bg-black shadow-[0_8px_16px_rgba(0,0,0,0.1)] hover:shadow-[0_12px_24px_rgba(0,0,0,0.15)] group'
                    }
                `}
            >
                {/* Subtle shine effect for premium feel */}
                {!isLoading && (
                    <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12" />
                )}
                
                {isLoading ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                        <span>Processing...</span>
                    </>
                ) : (
                    <>
                        <span className="relative z-10">{event.price > 0 ? 'Proceed to Payment' : 'Complete Registration'}</span>
                        <div className="relative z-10 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center transition-transform group-hover:translate-x-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                    </>
                )}
            </motion.button>

            {/* Capacity Warning */}
            {event.max_capacity && (
                <p className="text-[12px] font-medium text-center text-gray-400 uppercase tracking-wider mt-4">
                    Limited spots: {event.max_capacity} participants max
                </p>
            )}
        </form>
    );
}
