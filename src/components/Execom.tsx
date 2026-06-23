import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, Mail } from "lucide-react";
import { createPB, buildFileUrl } from "@/lib/pb";
import { Linkedin, Instagram } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";

interface ExecomMemberDoc {
  id: string;
  order: number;
  name: string;
  position: string;
  department: string;
  photo?: string;
  linkedin?: string;
  instagram?: string;
  email?: string;
  phone?: string;
}

/* ── Individual Member Card ── */

const MemberCard: React.FC<{ member: ExecomMemberDoc; index: number }> = ({
  member,
  index,
}) => {
  const [imgError, setImgError] = useState(false);
  const photoUrl = member.photo
    ? buildFileUrl("execom", member.id, member.photo)
    : "";
  const initials = member.name
    ? member.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";
  const hasSocial = !!(
    member.linkedin || member.instagram || member.email
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="group"
    >
      <div className="relative bg-white border border-gray-100 rounded-2xl overflow-hidden hover:border-gray-200 hover:shadow-xl transition-all duration-500 hover:scale-[1.02]">
        {/* Photo / Initials Fallback */}
        <div className="relative aspect-[3/4] bg-gray-50 overflow-hidden">
          {photoUrl && !imgError ? (
            <img
              src={photoUrl}
              alt={member.name}
              loading="lazy"
              onError={() => setImgError(true)}
              className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
              <span className="text-3xl md:text-4xl font-bold text-gray-300">
                {initials}
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3 md:p-4">
          <div className="text-[10px] font-semibold text-ieee-blue uppercase tracking-wider mb-1 truncate">
            {member.position}
          </div>
          <h3 className="font-semibold text-gray-900 text-sm leading-tight mb-1 truncate">
            {member.name}
          </h3>
          {member.department && (
            <p className="text-[11px] text-gray-400 font-medium truncate">
              {member.department}
            </p>
          )}
        </div>

        {/* Hover Social Links */}
        {hasSocial && (
          <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {member.linkedin && (
              <a
                href={member.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center hover:bg-[#0077B5] hover:text-white transition-all hover:scale-110"
                aria-label={`${member.name}&apos;s LinkedIn`}
              >
                <Linkedin className="w-3.5 h-3.5" />
              </a>
            )}
            {member.instagram && (
              <a
                href={member.instagram}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center hover:bg-gradient-to-br hover:from-[#833AB4] hover:via-[#E1306C] hover:to-[#F77737] hover:text-white transition-all hover:scale-110"
                aria-label={`${member.name}&apos;s Instagram`}
              >
                <Instagram className="w-3.5 h-3.5" />
              </a>
            )}
            {member.email && (
              <a
                href={`mailto:${member.email}`}
                onClick={(e) => e.stopPropagation()}
                className="w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center hover:bg-gray-800 hover:text-white transition-all hover:scale-110"
                aria-label={`Email ${member.name}`}
              >
                <Mail className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

/* ── Main Execom Section ── */

export const Execom: React.FC = () => {
  const [members, setMembers] = useState<ExecomMemberDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const pb = createPB();
    pb.collection("execom")
      .getList(1, 100, {
        sort: "order",
        fields:
          "id,order,name,position,department,photo,linkedin,instagram,email,phone",
      })
      .then((result) => {
        setMembers(result.items as ExecomMemberDoc[]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <section
      className="bg-white py-20 md:py-32 relative overflow-hidden"
      id="execom"
    >
      <div className="absolute top-0 left-0 w-full h-px bg-gray-200" />
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-ieee-blue/5 rounded-full blur-3xl" />
      <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-ieee-blue/5 rounded-full blur-3xl" />

      <div className="container mx-auto px-4 relative z-10">
        {/* Heading Section */}
        <div className="mb-16 md:mb-20">
          <div className="flex items-center space-x-2 mb-6">
            <Users className="w-5 h-5 text-ieee-blue" />
            <h3 className="font-pixel text-lg md:text-xl text-gray-800">
              THE EXECOM
            </h3>
            <div className="h-px grow bg-gray-300 ml-4" />
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
              The executive committee driving innovation, collaboration, and
              excellence at IEEE Sahrdaya SB.
            </motion.p>
          </div>
        </div>

        {/* Loading State — skeleton cards */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-[3/4] rounded-2xl" />
                <div className="space-y-2 px-1">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Members Grid */}
        {!loading && members.length > 0 && (
          <motion.div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {members.map((member, index) => (
              <MemberCard key={member.id} member={member} index={index} />
            ))}
          </motion.div>
        )}

        {/* Empty State */}
        {!loading && members.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-500 mb-2">
              Coming Soon
            </h3>
            <p className="text-gray-400 text-sm max-w-md mx-auto">
              We&apos;re assembling the team. Check back soon to meet the
              executive committee driving innovation at IEEE Sahrdaya SB.
            </p>
          </motion.div>
        )}
      </div>
    </section>
  );
};
