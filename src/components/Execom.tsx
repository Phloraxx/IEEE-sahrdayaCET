'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import TransitionLink from '@/components/PageTransition/TransitionLink';
import { Users, ArrowUpRight, Linkedin, Mail, Phone } from 'lucide-react';

interface Member {
    name: string;
    role: string;
    tagline: string;
    image: string;
    linkedin?: string;
    email?: string;
    phone?: string;
}

const execomMembers: Member[] = [
    {
        name: 'Anil Antony',
        role: 'Branch Counselor',
        tagline: 'GUIDING LIGHT',
        image: '/Execom/anilantony.jpg',
    },
    {
        name: 'Sneha Prasanth',
        role: 'Chairperson',
        tagline: 'LEADING THE CHARGE',
        image: '/Execom/Sneha Prasanth/Sneha Prasanth.JPG',
    },
    {
        name: 'Irene Anto',
        role: 'Vice Chairperson',
        tagline: 'VISION & STRATEGY',
        image: '/Execom/Irene Anto/Irene_anto.jpg',
    },
    {
        name: 'Ameenul Irfan',
        role: 'Secretary',
        tagline: 'KEEPING IT TOGETHER',
        image: '/Execom/Ameenul Irfan_/Ameenul_irfan.jpg',
    },
    {
        name: 'Binu Ashik',
        role: 'Joint Secretary',
        tagline: 'BRIDGING THE GAP',
        image: '/Execom/Binu Ashik K/Binu_ashik.jpg',
    },
    {
        name: 'Aaron Stanphen',
        role: 'Treasurer',
        tagline: 'NUMBERS & BEYOND',
        image: '/Execom/Aaron Stanphen_/Aaron_stanphen.jpg',
    },
    {
        name: 'Sourav P Bijoy',
        role: 'Webmaster',
        tagline: 'DIGITAL ARCHITECT',
        image: '/Execom/Sourav P Bijoy/SouravPBijoy.jpg',
    },
    {
        name: 'Akhila Thomas',
        role: 'MDC',
        tagline: 'MEMBERSHIP DRIV',
        image: '/Execom/Akhila Thomas/Screenshot_20240811_185346_Gallery.jpg',
    },
    {
        name: 'Alfin Joshi P',
        role: 'ECC',
        tagline: 'ELECTRONIC & COMM',
        image: '/Execom/alfin_joshi.jpeg',
    },
    {
        name: 'Midhun P M',
        role: 'Technical Coordinator',
        tagline: 'TECH WIZARD',
        image: '/Execom/Midhun P M/IMG_20240701_173337.jpg',
    },
    {
        name: 'Angelina Victor',
        role: 'Link Rep',
        tagline: 'LINKING MINDS',
        image: '/Execom/Angelina Victor Varghese/eb65501f-0ea7-4a50-be56-0fd854318583.jpg',
    },
];

const MarqueeText: React.FC<{ text: string }> = ({ text }) => {
    const repeated = `${text} ~ `.repeat(12);
    return (
        <div className="overflow-hidden whitespace-nowrap">
            <motion.div
                className="inline-block"
                animate={{ x: ['0%', '-50%'] }}
                transition={{
                    x: {
                        repeat: Infinity,
                        repeatType: 'loop',
                        duration: 8,
                        ease: 'linear',
                    },
                }}
            >
                <span className="text-[10px] md:text-xs font-mono tracking-[0.3em] text-ieee-blue/60 uppercase">
                    {repeated}
                </span>
            </motion.div>
        </div>
    );
};

const MemberCard: React.FC<{ member: Member; index: number }> = React.memo(({ member, index }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <motion.div
            className="flex flex-col group cursor-pointer"
            initial={{ opacity: 0, y: 60 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.7, delay: index * 0.12, ease: [0.2, 0.65, 0.3, 0.9] }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Image Container */}
            <div className="relative overflow-hidden rounded-xl aspect-[3/4] mb-4 bg-gray-100">
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                {/* Image */}
                <div className="relative w-full h-full">
                    <Image
                        src={member.image}
                        alt={member.name}
                        fill
                        sizes="270px"
                        className={`object-cover transition-transform duration-[600ms] ease-[cubic-bezier(0.2,0.65,0.3,0.9)] ${isHovered ? 'scale-105' : 'scale-100'}`}
                    />
                </div>

                {/* Role badge - top left */}
                <div className="absolute top-3 left-3 z-20">
                    <span className="px-2 py-1 bg-white/90 backdrop-blur-sm text-[9px] md:text-[10px] font-mono tracking-[0.15em] text-gray-700 rounded-sm uppercase">
                        {member.role}
                    </span>
                </div>

                {/* Hover overlay content */}
                <motion.div
                    className="absolute bottom-4 left-4 right-4 z-20 flex items-center justify-between"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: isHovered ? 1 : 0, y: isHovered ? 0 : 20 }}
                    transition={{ duration: 0.3 }}
                >
                    <div className="flex gap-2">
                        <a
                            href={member.linkedin || "#"}
                            target={member.linkedin ? "_blank" : "_self"}
                            rel="noopener noreferrer"
                            onClick={(e) => !member.linkedin && e.preventDefault()}
                            aria-label="View on LinkedIn"
                            className="w-8 h-8 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-white/40 transition-colors"
                        >
                            <Linkedin className="w-3.5 h-3.5 text-white" />
                        </a>
                        <a
                            href={member.email ? `mailto:${member.email}` : "#"}
                            onClick={(e) => !member.email && e.preventDefault()}
                            aria-label="Send email"
                            className="w-8 h-8 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-white/40 transition-colors"
                        >
                            <Mail className="w-3.5 h-3.5 text-white" />
                        </a>
                        <a
                            href={member.phone ? `tel:${member.phone}` : "#"}
                            onClick={(e) => !member.phone && e.preventDefault()}
                            aria-label="Call"
                            className="w-8 h-8 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-white/40 transition-colors"
                        >
                            <Phone className="w-3.5 h-3.5 text-white" />
                        </a>
                    </div>
                </motion.div>

                {/* Index number - bottom right corner */}
                <div className="absolute bottom-3 right-3 z-20 opacity-20 group-hover:opacity-0 transition-opacity">
                    <span className="font-pixel text-4xl md:text-5xl text-white font-bold">
                        {String(index + 1).padStart(2, '0')}
                    </span>
                </div>
            </div>

            {/* Name */}
            <h4 className="font-sans font-bold text-lg md:text-xl text-gray-900 tracking-tight mb-0.5 group-hover:text-ieee-blue transition-colors duration-300">
                {member.name}
            </h4>

            {/* Marquee tagline */}
            <div className="mt-1 overflow-hidden rounded-sm">
                <MarqueeText text={member.tagline} />
            </div>
        </motion.div>
    );
});
MemberCard.displayName = 'MemberCard';

const CARD_WIDTH = 270;
const GAP = 30;
const ITEM_SIZE = CARD_WIDTH + GAP;

const DragCarousel: React.FC<{ members: Member[] }> = ({ members }) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const offsetRef = useRef(0);
    const rafRef = useRef<number>(0);
    const sectionRef = useRef<HTMLDivElement>(null);
    const [isInView, setIsInView] = useState(false);
    const [hasStartedScrolling, setHasStartedScrolling] = useState(false);

    // Physics state
    const physics = useRef({
        isDragging: false,
        startX: 0,
        currentX: 0,
        velocity: 0,
        lastTime: 0,
        lastX: 0
    });

    const animate = useCallback(() => {
        if (!trackRef.current) return;

        if (!document.hidden) {
            // Apply momentum when not dragging
            if (!physics.current.isDragging) {
                physics.current.velocity *= 0.98; // Smoother friction

                // Auto-scroll only if section is in view and has started scrolling
                if (Math.abs(physics.current.velocity) < 0.05 && isInView && hasStartedScrolling) {
                    // Smoothly accelerate to target speed instead of snapping
                    const targetVelocity = -0.5;
                    physics.current.velocity += (targetVelocity - physics.current.velocity) * 0.1;
                }
            }

            offsetRef.current += physics.current.velocity;

            // Infinite loop logic
            const contentWidth = ITEM_SIZE * members.length;
            // If we've scrolled past the first set, reset to 0
            if (offsetRef.current <= -contentWidth) {
                offsetRef.current += contentWidth;
            }
            // If we've scrolled past the start (to the right), reset to end
            if (offsetRef.current > 0) {
                offsetRef.current -= contentWidth;
            }

            trackRef.current.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
        }

        rafRef.current = requestAnimationFrame(animate);
    }, [isInView, hasStartedScrolling, members.length]);

    useEffect(() => {
        rafRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafRef.current);
    }, [animate]);

    // Intersection Observer to detect when section is fully in view
    useEffect(() => {
        const element = sectionRef.current;
        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsInView(entry.isIntersecting && entry.intersectionRatio >= 0.8);
            },
            { threshold: 0.8 }
        );

        if (element) {
            observer.observe(element);
        }

        return () => {
            if (element) {
                observer.unobserve(element);
            }
        };
    }, []);

    // Delay auto-scroll by 3 seconds when section comes into view
    useEffect(() => {
        if (isInView && !hasStartedScrolling) {
            const timer = setTimeout(() => {
                setHasStartedScrolling(true);
            }, 500); // 3 second delay

            return () => clearTimeout(timer);
        } else if (!isInView) {
            // Reset when out of view
            setHasStartedScrolling(false);
        }
    }, [isInView, hasStartedScrolling]);

    const onPointerDown = (e: React.PointerEvent) => {
        // Only capture simple left clicks or touches
        if (e.button !== 0) return;

        physics.current.isDragging = true;
        physics.current.startX = e.clientX;
        physics.current.lastX = e.clientX;
        physics.current.lastTime = performance.now();
        physics.current.velocity = 0;

        // Important: Stop auto-scroll immediately
        // e.currentTarget.setPointerCapture(e.pointerId); // Optional, sometimes causes issues on mobile scroll
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (!physics.current.isDragging) return;

        const now = performance.now();
        const deltaX = e.clientX - physics.current.lastX;
        const deltaTime = now - physics.current.lastTime;

        // Update offset immediately
        offsetRef.current += deltaX;

        // Calculate velocity for momentum (smoothed)
        if (deltaTime > 0) {
            const newVelocity = (deltaX / deltaTime) * 16; // Normalize to 60fps
            // Smooth velocity to prevent jitter
            physics.current.velocity = physics.current.velocity * 0.8 + newVelocity * 0.2;
        }

        physics.current.lastX = e.clientX;
        physics.current.lastTime = now;
    };

    const onPointerUp = () => {
        if (!physics.current.isDragging) return;
        physics.current.isDragging = false;
        // e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const items = [...members, ...members, ...members];

    return (
        <div
            ref={sectionRef}
            className="relative w-full select-none"
        >
            {/* Carousel track */}
            <div
                className="overflow-hidden cursor-grab active:cursor-grabbing py-4 touch-pan-y"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerLeave={onPointerUp}
            >
                <div
                    ref={trackRef}
                    className="flex will-change-transform"
                    style={{ gap: `${GAP}px` }}
                >
                    {items.map((member, index) => (
                        <div
                            key={`${member.name}-${index}`}
                            className="flex-shrink-0 transition-transform duration-300 ease-out hover:-translate-y-2"
                            style={{ width: `${CARD_WIDTH}px` }}
                        >
                            <MemberCard member={member} index={index % members.length} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export const Execom: React.FC = () => {
    const [membersList, setMembersList] = useState<Member[]>(execomMembers);

    useEffect(() => {
        const fetchContacts = async () => {
            try {
                const response = await fetch('/api/execom?limit=100&depth=1');
                if (response.ok) {
                    const data = await response.json();
                    interface DbDoc { id?: string; name: string; photoUrl?: string; linkedin?: string; email?: string; phone?: string; }
                    const dbDocs: DbDoc[] = (data.docs || data.execom || []).map((doc: Record<string, unknown>) => ({
                        id: doc.id as string | undefined,
                        name: doc.name as string,
                        photoUrl: ((doc.photo as Record<string, unknown>)?.url as string) || (doc.photoUrl as string),
                        linkedin: doc.linkedin as string | undefined,
                        email: doc.email as string | undefined,
                        phone: doc.phone as string | undefined,
                    }));
                    const dbDocsMap = new Map(dbDocs.map(doc => [doc.name.toLowerCase(), doc]));

                    const updatedMembers = execomMembers.map(member => {
                        const dbMatch = dbDocsMap.get(member.name.toLowerCase());
                        if (dbMatch) {
                            return {
                                ...member,
                                linkedin: dbMatch.linkedin || member.linkedin,
                                email: dbMatch.email || member.email,
                                phone: dbMatch.phone || member.phone,
                            };
                        }
                        return member;
                    });

                    setMembersList(updatedMembers);
                }
            } catch (err) {
                console.error("Failed to fetch execom contacts:", err);
            }
        };

        fetchContacts();
    }, []);

    return (
        <section className="bg-white py-20 md:py-32 relative overflow-hidden" id="execom">
            {/* Background decorative elements */}
            <div className="absolute top-0 left-0 w-full h-px bg-gray-200" />
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-ieee-blue/5 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-ieee-blue/5 rounded-full blur-3xl" />

            <div className="container mx-auto px-4 relative z-10">
                {/* Section header */}
                <div className="mb-16 md:mb-20">
                    <div className="flex items-center space-x-2 mb-6">
                        <Users className="w-5 h-5 text-ieee-blue" />
                        <h3 className="font-pixel text-lg md:text-xl text-gray-800">THE EXECOM</h3>
                        <div className="h-px flex-grow bg-gray-300 ml-4" />
                    </div>

                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8 }}
                        >
                            <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight leading-[1.1]">
                                Meet the people
                                <br />
                                <span className="text-ieee-blue">behind the vision.</span>
                            </h2>
                        </motion.div>

                        <motion.p
                            className="text-sm md:text-base text-gray-500 max-w-sm font-mono"
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.3, duration: 0.8 }}
                        >
                            The executive committee driving innovation, collaboration, and excellence at IEEE Sahrdaya SB.
                        </motion.p>
                    </div>
                </div>

                {/* Stats row */}
                <motion.div
                    className="grid grid-cols-3 gap-4 mb-16 md:mb-20 border-y border-gray-200 py-8"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                >
                    <div className="text-center md:text-left">
                        <div className="font-mono text-[10px] tracking-[0.3em] text-gray-400 uppercase mb-1">Roster</div>
                        <div className="font-bold text-2xl md:text-4xl text-gray-900">80</div>
                    </div>
                    <div className="text-center">
                        <div className="font-mono text-[10px] tracking-[0.3em] text-gray-400 uppercase mb-1">Events Led</div>
                        <div className="font-bold text-2xl md:text-4xl text-gray-900">100+</div>
                    </div>
                    <div className="text-center md:text-right">
                        <div className="font-mono text-[10px] tracking-[0.3em] text-gray-400 uppercase mb-1">Societies</div>
                        <div className="font-bold text-2xl md:text-4xl text-gray-900">14</div>
                    </div>
                </motion.div>

                {/* Draggable Carousel */}
                <DragCarousel members={membersList} />

                {/* View Full Execom Button */}
                <div className="mt-12 flex justify-center">
                    <TransitionLink
                        href="/full-execom"
                        className="group relative inline-flex items-center justify-center px-8 py-3 font-mono text-sm uppercase tracking-widest text-white transition-all duration-300 bg-ieee-blue/90 hover:bg-ieee-blue rounded-full"
                    >
                        <span>View Full Execom</span>
                        <ArrowUpRight className="ml-2 w-4 h-4 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" />
                    </TransitionLink>
                </div>

                {/* Bottom CTA */}
                <motion.div
                    className="mt-16 md:mt-24 flex flex-col md:flex-row items-center justify-center gap-4 text-center"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                >
                    <div className="h-px w-16 bg-gray-300 hidden md:block" />
                    <p className="font-mono text-xs text-gray-400 tracking-[0.2em] uppercase">
                        Want to be part of the team?
                    </p>
                    <a
                        href="https://students.ieee.org/"
                        target="_blank"
                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white text-xs font-mono tracking-wider rounded-full hover:bg-ieee-blue transition-colors duration-300 uppercase"
                    >
                        Join IEEE <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                    <div className="h-px w-16 bg-gray-300 hidden md:block" />
                </motion.div>
            </div>
        </section>
    );
};
