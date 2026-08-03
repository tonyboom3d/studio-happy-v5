import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Check, UserCheck, Send, Copy, Settings, ChevronDown, ChevronUp,
  Calendar, MapPin, Tag, CreditCard, CalendarPlus, MessageCircle,
  HelpCircle, X, ExternalLink, User, Mail, Phone, MoveLeft, Baby, Plus, Minus, Image as ImageIcon,
  Link2, LayoutGrid, Users, Trash2, AlertTriangle, UserPlus, Lock, CheckSquare, Square, ListOrdered, Loader2,
  MessageSquare,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import DeadlineCountdown from './DeadlineCountdown';
import ParticipantSetupForm from './ParticipantSetupForm';
import SketchSelectionView from './SketchSelectionView';
import OrganizerSelfSelectionView from './OrganizerSelfSelectionView';
import EnlargeableSketchImage from './EnlargeableSketchImage';
import { getSelectionDisplaySize, selectionWants90Upgrade } from '@/lib/utils';
import { isEditingWindowClosed } from '@/lib/sketchEditingPolicy';
import {
  isLockedStatus,
  normalizeSketchStatus,
  SKETCH_STATUS,
  getSketchStatusShortLabel,
  getSketchStatusBadgeStyle,
  getSketchStatusLabel,
  findLockedInGroup,
} from '@/lib/sketchStatus';

function getSelectionStatusBadge(sel, editingWindowClosed) {
  const status = normalizeSketchStatus(sel.sketchStatus);
  const upgrade = sel.upgradePaymentStatus || null;
  const is90 = getSelectionDisplaySize(sel) === '90x90';

  const staffLabel = getSketchStatusShortLabel(status);
  if (staffLabel) {
    const style = getSketchStatusBadgeStyle(status);
    return {
      label: staffLabel,
      bg: style.bg,
      text: style.text,
      icon: status === SKETCH_STATUS.READY || status === SKETCH_STATUS.PREPARING || status === SKETCH_STATUS.REJECTED,
    };
  }
  if (editingWindowClosed)
    return { label: 'לא ניתן לשינוי', bg: 'bg-gray-100', text: 'text-gray-600', icon: true };
  if (is90 && upgrade === 'pending-payment-approval')
    return { label: 'ממתין לאישור תשלום', bg: 'bg-orange-100', text: 'text-orange-700', icon: false };
  if (is90 && upgrade !== 'paid')
    return { label: 'לא שולמה', bg: 'bg-red-100', text: 'text-red-700', icon: false };
  return { label: 'הושלמה', bg: 'bg-green-100', text: 'text-green-700', icon: false };
}

export default function OrganizerOrderHub({
  order,
  ecomSummary,
  orderHistory,
  onSwitchOrder,
  isSwitchingOrder,
  catalog,
  participants,
  selections,
  participantLinks,
  onChooseMode,
  onSaveParticipants,
  onCreateGroup,
  onDeleteGroup,
  onDeleteOrganizerGroup,
  onSelectSketch,
  onDeleteSketchSelection,
  onRequestUpgrade,
  onUpdateSettings,
  onUpdateParticipant,
  onCopyToClipboard,
  onFetchCatalog,
  onSwitchModeWithClear,
  isSaving,
  onValidateImage,
  onGenerateSketch,
  onSaveApprovedSketch,
  onSubmitFeedback,
  onCheckRateLimit,
  onGetAITermsStatus,
  onAcceptAITerms,
  onVerifySketchForEdit,
  onCheckGroupDeletable,
  session90,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [orderSwitcherOpen, setOrderSwitcherOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [modeChosen, setModeChosen] = useState(!!order.selectionMode);
  const [orderDetailsCollapsed, setOrderDetailsCollapsed] = useState(!!order.selectionMode);
  const [participantsExpanded, setParticipantsExpanded] = useState(false);
  const [shareFor, setShareFor] = useState(null); // participant currently being shared

  // Group creation modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSeats, setNewGroupSeats] = useState(1);
  const [newGroupChildren, setNewGroupChildren] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Group deletion (single confirmation)
  const [deleteFor, setDeleteFor] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteBlockedInfo, setDeleteBlockedInfo] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  // Mode switch warning
  const [modeSwitchTarget, setModeSwitchTarget] = useState(null);
  const [modeSwitching, setModeSwitching] = useState(false);
  const [modeSwitchLockedInfo, setModeSwitchLockedInfo] = useState(null);

  const lockedSelection = useMemo(
    () => (selections || []).find((sel) => isLockedStatus(sel?.sketchStatus)),
    [selections]
  );

  const handleModeClick = useCallback((mode) => {
    const currentMode = order.selectionMode;
    if (currentMode && currentMode !== mode) {
      if (lockedSelection) {
        setModeSwitchLockedInfo({ status: normalizeSketchStatus(lockedSelection.sketchStatus) });
        return;
      }
      const hasData = (participants?.length > 0) || (selections?.length > 0);
      if (hasData) {
        setModeSwitchTarget(mode);
        return;
      }
    }
    setModeChosen(true);
    setOrderDetailsCollapsed(true);
    onChooseMode(mode);
  }, [order.selectionMode, participants, selections, onChooseMode, lockedSelection]);

  const confirmModeSwitch = useCallback(async () => {
    if (!modeSwitchTarget || !onSwitchModeWithClear) return;
    setModeSwitching(true);
    try {
      await onSwitchModeWithClear(modeSwitchTarget);
      setModeSwitchTarget(null);
      setModeChosen(true);
      setOrderDetailsCollapsed(true);
    } finally {
      setModeSwitching(false);
    }
  }, [modeSwitchTarget, onSwitchModeWithClear]);

  const workshopDate = order.workshopStart
    ? format(new Date(order.workshopStart), 'EEEE, d בMMMM yyyy', { locale: he })
    : null;

  const workshopStartTime = order.workshopStart
    ? format(new Date(order.workshopStart), 'HH:mm')
    : null;

  const workshopEndTime = order.workshopStart
    ? format(new Date(new Date(order.workshopStart).getTime() + 4 * 60 * 60 * 1000), 'HH:mm')
    : null;

  const displayAddress = 'הדובדבן 7, קריית אונו - קומה 3';

  const whatsappText = encodeURIComponent(
    `שלום! ביצעתי הרגע הזמנה על שם ${ecomSummary?.buyerName || ''}, מספר ההזמנה שלי הוא ${ecomSummary?.orderNumber || ''}`
  );
  const whatsappUrl = `https://api.whatsapp.com/send?phone=972522272270&text=${whatsappText}`;

  const allRugSlots = Array.from({ length: order.rugCount }, (_, i) => ({
    rugIndex: i,
    participantName: null,
  }));

  const USER_SELECTIONS_BASE = 'https://www.studiohappy.art/user-selections';

  // Build the dedicated group selection link routing to the /user-selections page.
  // The group allocation (name, rugs, children) is embedded so the recipient page
  // can display the exact intended state.
  const buildGroupShareUrl = useCallback((token, participant) => {
    if (participant?.shortRef) {
      return `${USER_SELECTIONS_BASE}?ref=${participant.shortRef}`;
    }
    const params = new URLSearchParams();
    if (order?._id) params.set('orderId', order._id);
    if (token) params.set('token', token);
    if (participant?.name) params.set('group', participant.name);
    if (participant?.rugAllowance) params.set('rugs', String(participant.rugAllowance));
    const c = participant?.childrenCount || 0;
    if (c) params.set('children', String(c));
    return `${USER_SELECTIONS_BASE}?${params.toString()}`;
  }, [order?._id]);

  const buildShareMessage = useCallback((token, participant) => {
    const wsName = ecomSummary?.workshopName || 'סדנת טאפטינג - סטודיו האפי';
    const datePart = workshopDate || '';
    const timePart = workshopStartTime && workshopEndTime
      ? `${workshopStartTime}-${workshopEndTime}`
      : workshopStartTime || '';
    const url = buildGroupShareUrl(token, participant);
    return (
      `היי, הזמנתי לנו ${wsName}` +
      (datePart ? ` בתאריך ${datePart}` : '') +
      (timePart ? ` בשעות ${timePart}` : '') +
      ` - כל מה שנשאר לך זה לבחור סקיצה שתרצה/י לתפוף בקישור הבא:\n` +
      `${url}\n\n` +
      `לתשומת לבך, ניתן לבחור סקיצה עד 48 שעות לפני מועד הסדנה!`
    );
  }, [ecomSummary, workshopDate, workshopStartTime, workshopEndTime, buildGroupShareUrl]);

  const [copyWithDetails, setCopyWithDetails] = useState(true);

  const copyLink = (token, id, participant) => {
    const text = copyWithDetails
      ? buildShareMessage(token, participant)
      : buildGroupShareUrl(token, participant);
    if (onCopyToClipboard) {
      onCopyToClipboard(text).then(() => {
        setCopiedLink(id);
        setTimeout(() => setCopiedLink(null), 2000);
      }).catch(() => {
        fallbackCopy(text, id);
      });
    } else {
      fallbackCopy(text, id);
    }
  };

  const fallbackCopy = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedLink(id);
      setTimeout(() => setCopiedLink(null), 2000);
    }).catch(() => {});
  };

  const shareViaWhatsApp = (token, participant) => {
    const text = encodeURIComponent(buildShareMessage(token, participant));
    const waUrl = `https://api.whatsapp.com/send?text=${text}`;
    try { window.open(waUrl, '_blank', 'noopener,noreferrer'); } catch (_) {}
  };

  const shareViaEmail = (token, participant) => {
    const wsName = ecomSummary?.workshopName || 'סדנת טאפטינג - סטודיו האפי';
    const subject = encodeURIComponent(`בחירת סקיצה - ${wsName}`);
    const body = encodeURIComponent(buildShareMessage(token, participant));
    try { window.open(`mailto:?subject=${subject}&body=${body}`, '_blank'); } catch (_) {}
  };

  const selectionProgress = selections?.length || 0;
  const totalRugs = order.rugCount;

  const calendarUrl = useMemo(() => {
    if (!order.workshopStart) return null;
    const start = new Date(order.workshopStart);
    const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const title = encodeURIComponent(ecomSummary?.workshopName || 'סדנת טאפטינג - סטודיו האפי');
    const location = encodeURIComponent(ecomSummary?.location || '');
    const details = encodeURIComponent(
      `${order.adults} מבוגרים` +
      (order.children > 0 ? `, ${order.children} ילדים` : '') +
      `, ${order.rugCount} שטיחים`
    );
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&location=${location}&details=${details}`;
  }, [order, ecomSummary]);

  const hasCoupon = !!ecomSummary?.coupon;
  const hasDiscount = ecomSummary?.discount > 0;

  const organizerPhone = order.organizerPhone || ecomSummary?.buyerPhone || '';
  const formatPhone = (phone) => {
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return phone;
  };

  const participantCount = order.adults || 1;

  // Allocation accounting (1 rug == 1 adult/seat in this product).
  const maxRugs = order.rugCount || 0;
  const maxChildren = order.children || 0;
  const usedRugs = (participants || []).reduce((s, p) => s + (p.rugAllowance || 0), 0);
  const usedChildren = (participants || []).reduce((s, p) => s + (p.childrenCount || 0), 0);
  const remainingRugs = Math.max(0, maxRugs - usedRugs);
  const remainingChildren = Math.max(0, maxChildren - usedChildren);

  // Child allocation: minimum children for new group to keep remaining pool valid
  const minChildrenForCreate = useMemo(() => {
    if (maxChildren <= 0 || remainingChildren <= 0) return 0;
    return Math.max(0, remainingChildren - (remainingRugs - newGroupSeats));
  }, [maxChildren, remainingChildren, remainingRugs, newGroupSeats]);

  useEffect(() => {
    if (createOpen && newGroupChildren < minChildrenForCreate) {
      setNewGroupChildren(minChildrenForCreate);
    }
  }, [minChildrenForCreate, createOpen]);

  // 48h-before-workshop lock (server enforces authoritatively; this is UX only).
  const within48h = order.workshopStart
    ? (new Date(order.workshopStart).getTime() - Date.now() <= 48 * 60 * 60 * 1000)
    : false;

  const editingWindowClosed = useMemo(
    () => isEditingWindowClosed(order),
    [order?.editingWindowAllowed, order?.deadlineAt]
  );

  const openCreate = () => {
    if (remainingRugs <= 0) return;
    setNewGroupName('');
    setNewGroupSeats(1);
    setNewGroupChildren(0);
    setCreateError('');
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    const name = newGroupName.trim();
    if (!name) { setCreateError('יש להזין שם קבוצה'); return; }
    if (newGroupSeats < 1 || newGroupSeats > remainingRugs) { setCreateError('מספר המשתתפים חורג מהזמין'); return; }
    if (newGroupChildren > remainingChildren) { setCreateError('מספר הילדים חורג מהזמין'); return; }
    const effectiveChildren = Math.max(newGroupChildren, minChildrenForCreate);
    if (effectiveChildren > newGroupSeats) { setCreateError('מספר הילדים לא יכול לעלות על מספר המבוגרים בקבוצה'); return; }

    let childrenForThisGroup = effectiveChildren;
    const rugsAfterThis = remainingRugs - newGroupSeats;
    const childrenLeftAfterThis = remainingChildren - newGroupChildren;
    if (rugsAfterThis === 0 && childrenLeftAfterThis > 0 && maxChildren > 0) {
      const adultsInGroup = newGroupSeats;
      const groupsToSpread = [
        ...(participants || []).filter(p => (p.childrenCount || 0) === 0).map(p => ({ id: p._id, adults: p.rugAllowance || 0 })),
        ...(childrenForThisGroup === 0 ? [{ id: '__new__', adults: adultsInGroup }] : []),
      ];
      const totalAdultsInSpread = groupsToSpread.reduce((s, g) => s + g.adults, 0);
      if (totalAdultsInSpread > 0) {
        let leftover = childrenLeftAfterThis;
        const allocations = {};
        for (const g of groupsToSpread) {
          const share = Math.round((g.adults / totalAdultsInSpread) * childrenLeftAfterThis);
          const bounded = Math.min(share, g.adults, leftover);
          allocations[g.id] = bounded;
          leftover -= bounded;
        }
        if (leftover > 0) {
          for (const g of groupsToSpread) {
            const canAdd = g.adults - (allocations[g.id] || 0);
            const add = Math.min(canAdd, leftover);
            allocations[g.id] = (allocations[g.id] || 0) + add;
            leftover -= add;
            if (leftover <= 0) break;
          }
        }
        if (allocations['__new__']) childrenForThisGroup += allocations['__new__'];
        delete allocations['__new__'];
        const updatePromises = [];
        for (const [pid, extra] of Object.entries(allocations)) {
          if (extra > 0) {
            const p = (participants || []).find(x => x._id === pid);
            if (p) updatePromises.push(onUpdateParticipant(pid, { childrenCount: (p.childrenCount || 0) + extra }));
          }
        }
        if (updatePromises.length) await Promise.all(updatePromises);
      }
    }

    setCreating(true);
    setCreateError('');
    try {
      const created = await onCreateGroup({ name, participants: newGroupSeats, children: childrenForThisGroup });
      if (created) {
        setCreateOpen(false);
        setShareFor(created);
      } else {
        setCreateError('יצירת הקבוצה נכשלה, נסו שוב');
      }
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.startsWith('RUG_LIMIT_EXCEEDED')) setCreateError('אין מספיק שטיחים פנויים');
      else if (msg.startsWith('CHILDREN_LIMIT_EXCEEDED')) setCreateError('אין מספיק מקומות לילדים');
      else setCreateError('יצירת הקבוצה נכשלה, נסו שוב');
    } finally {
      setCreating(false);
    }
  };

  const askDelete = (p) => {
    if (within48h) return;
    setDeleteError('');

    const localLocked = findLockedInGroup(selections, { participantId: p._id });
    if (localLocked) {
      setDeleteBlockedInfo({ groupName: p.name, status: localLocked });
      return;
    }

    setDeleteFor(p);
  };

  const formatDeleteError = (msg) => {
    if (msg.includes('DELETE_LOCKED_SKETCH_STATUS:')) {
      const status = msg.split('DELETE_LOCKED_SKETCH_STATUS:')[1];
      return `לא ניתן למחוק את הקבוצה — יש סקיצה בסטטוס "${getSketchStatusLabel(status)}"`;
    }
    if (msg.includes('DELETE_LOCKED_48H')) return 'לא ניתן למחוק קבוצה בתוך 48 שעות מהסדנה';
    return 'מחיקת הקבוצה נכשלה, נסו שוב';
  };

  const confirmDelete = async () => {
    if (!deleteFor) return;
    setDeleting(true);
    setDeleteError('');
    try {
      if (onCheckGroupDeletable) {
        const check = await onCheckGroupDeletable({ participantId: deleteFor._id });
        if (!check?.canDelete) {
          setDeleteFor(null);
          setDeleteBlockedInfo({
            groupName: deleteFor.name,
            status: check?.lockedSketchStatus || 'בהכנה',
          });
          return;
        }
      }
      await onDeleteGroup(deleteFor._id);
      setDeleteFor(null);
    } catch (e) {
      setDeleteError(formatDeleteError(String(e?.message || '')));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="py-3 space-y-3" dir="rtl">
      {/* Order header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-center gap-2.5 text-center"
      >
        <div className="w-9 h-9 rounded-full bg-[#5E2F88] flex items-center justify-center shrink-0">
          <Check className="w-5 h-5 text-white" />
        </div>
        <div className="text-right">
          <h1 className="text-[22px] font-bold text-[#581E83] leading-tight">ההזמנה בוצעה בהצלחה!</h1>
          <p className="text-[15px] text-[#464646]/60 leading-tight">
            עכשיו נשאר לבחור סקיצות
            {ecomSummary?.orderNumber && ` · הזמנה ${ecomSummary.orderNumber}`}
          </p>
          {organizerPhone && (
            <p className="text-[13px] text-green-700 flex items-center gap-1 mt-1">
              <MessageCircle className="w-3.5 h-3.5 shrink-0 text-green-600" />
              <span className="truncate">
                פרטי ההזמנה נשלחו אליך בוואטסאפ ל-
                <span className="font-semibold" dir="ltr">{formatPhone(organizerPhone)}</span>
              </span>
            </p>
          )}
        </div>
      </motion.div>

      {/* "My orders" switcher — only shown when the buyer has other paid orders */}
      {orderHistory?.length > 0 && (
        <div className="relative flex justify-center">
          <button
            type="button"
            onClick={() => setOrderSwitcherOpen((v) => !v)}
            disabled={isSwitchingOrder}
            className="flex items-center gap-1.5 text-[13px] font-medium text-[#5E2F88] hover:text-[#7B3DB0] bg-[#f5f0fa] border border-[#5E2F88]/20 rounded-full px-3 py-1.5 transition-colors disabled:opacity-60"
          >
            {isSwitchingOrder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListOrdered className="w-3.5 h-3.5" />}
            ההזמנות שלי ({orderHistory.length + 1})
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${orderSwitcherOpen ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {orderSwitcherOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute top-full mt-2 z-30 w-72 bg-white rounded-xl border border-[#e8e8e8] shadow-lg overflow-hidden"
              >
                <div className="px-3 py-2 bg-[#5E2F88] text-white text-[13px] font-semibold flex items-center justify-between">
                  <span>הזמנה נוכחית</span>
                  {ecomSummary?.orderNumber && <span dir="ltr">#{ecomSummary.orderNumber}</span>}
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-[#e8e8e8]">
                  {orderHistory.map((h) => (
                    <button
                      key={h._id}
                      type="button"
                      onClick={() => { setOrderSwitcherOpen(false); onSwitchOrder && onSwitchOrder(h._id); }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-right hover:bg-[#f5f0fa] transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-[#581E83] truncate">
                          {h.orderNumber ? `הזמנה #${h.orderNumber}` : 'הזמנה'}
                        </p>
                        <p className="text-[12px] text-[#464646]/60">
                          {h.workshopStart ? format(new Date(h.workshopStart), 'd בMMMM yyyy', { locale: he }) : ''}
                        </p>
                      </div>
                      {h.paidTotal > 0 && (
                        <span className="text-[13px] font-semibold text-[#5E2F88] shrink-0">₪{h.paidTotal}</span>
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Expand toggle — visible only when collapsed */}
      <AnimatePresence>
        {orderDetailsCollapsed && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            type="button"
            onClick={() => setOrderDetailsCollapsed(false)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[13px] font-medium text-[#464646]/60 hover:text-[#5E2F88] transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
            הצג פרטי הזמנה
          </motion.button>
        )}
      </AnimatePresence>

      {/* Collapsible order details block */}
      <AnimatePresence initial={false}>
        {!orderDetailsCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-3">
              {/* Workshop & customer details — merged card */}
              <div className="bg-white rounded-2xl border border-[#e8e8e8] p-3.5 shadow-sm space-y-2.5">
                <div className="sm:grid sm:grid-cols-2 sm:gap-4">
                  {/* Column 1: Workshop details */}
                  <div className="space-y-2">
                    {ecomSummary?.workshopName && (
                      <h3 className="text-lg font-bold text-[#581E83] leading-snug">{ecomSummary.workshopName}</h3>
                    )}
                    {workshopDate && (
                      <div className="flex items-start gap-1.5 text-[15px] text-[#464646]">
                        <Calendar className="w-4 h-4 text-[#5E2F88] shrink-0 mt-0.5" />
                        <span>
                          {workshopDate}
                          {workshopStartTime && (
                            <span className="text-[#5E2F88] font-medium mr-1.5">
                              בשעה {workshopStartTime}{workshopEndTime && ` - ${workshopEndTime}`}
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    <div className="flex items-start gap-1.5 text-[15px] text-[#464646]">
                      <MapPin className="w-4 h-4 text-[#5E2F88] shrink-0 mt-0.5" />
                      <span>{displayAddress}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[15px] text-[#464646]">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <UserCheck className="w-4 h-4 text-[#5E2F88] shrink-0" />
                        <span className="truncate">
                          {order.adults} {order.adults === 1 ? 'מבוגר' : 'מבוגרים'}
                          {order.children > 0 && ` + ${order.children} ${order.children === 1 ? 'ילד' : 'ילדים'}`}
                          {' · '}{order.rugCount} {order.rugCount === 1 ? 'שטיח' : 'שטיחים'}
                        </span>
                      </span>
                      <span className={`shrink-0 font-medium ${selectionProgress === totalRugs ? 'text-green-600' : 'text-orange-600'}`}>
                        {selectionProgress}/{totalRugs} נבחרו
                      </span>
                    </div>
                  </div>

                  {/* Column 2: Customer details — collapsible on mobile */}
                  {ecomSummary && (
                    <div className="sm:border-r sm:border-[#e8e8e8] sm:pr-4">
                      <button
                        type="button"
                        onClick={() => setDetailsExpanded(!detailsExpanded)}
                        className="sm:hidden flex items-center gap-1.5 mt-2.5 text-[15px] font-semibold text-[#581E83] w-full"
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform ${detailsExpanded ? 'rotate-180' : ''}`} />
                        פרטי המזמין
                      </button>
                      <h4 className="hidden sm:block text-[15px] font-semibold text-[#581E83] mb-2">פרטי המזמין</h4>
                      <div className={`space-y-1.5 overflow-hidden transition-all sm:!max-h-none sm:!opacity-100 sm:!mt-0 ${detailsExpanded ? 'max-h-40 opacity-100 mt-2' : 'max-h-0 opacity-0 sm:max-h-none sm:opacity-100'}`}>
                        {ecomSummary.buyerName && (
                          <div className="flex items-center gap-2 text-[15px] text-[#464646]">
                            <User className="w-4 h-4 text-[#5E2F88] shrink-0" />
                            <span className="font-medium">{ecomSummary.buyerName}</span>
                          </div>
                        )}
                        {ecomSummary.buyerEmail && (
                          <div className="flex items-center gap-2 text-[15px] text-[#464646]">
                            <Mail className="w-4 h-4 text-[#5E2F88] shrink-0" />
                            <span dir="ltr" className="text-left truncate">{ecomSummary.buyerEmail}</span>
                          </div>
                        )}
                        {ecomSummary.buyerPhone && (
                          <div className="flex items-center gap-2 text-[15px] text-[#464646]">
                            <Phone className="w-4 h-4 text-[#5E2F88] shrink-0" />
                            <span dir="ltr" className="font-medium">{formatPhone(ecomSummary.buyerPhone)}</span>
                          </div>
                        )}
                        {ecomSummary.organizerNotes && (
                          <div className="flex items-start gap-2 text-[15px] text-[#464646]">
                            <MessageSquare className="w-4 h-4 text-[#5E2F88] shrink-0 mt-0.5" />
                            <span className="whitespace-pre-wrap">{ecomSummary.organizerNotes}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Price — total only, with discount inline */}
                {ecomSummary && (
                  <div className="border-t border-[#e8e8e8] pt-2 mt-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[15px] text-[#464646]">
                      <CreditCard className="w-4 h-4 text-[#5E2F88]" />
                      סה״כ שולם
                      {(hasCoupon || hasDiscount) && (
                        <span className="text-green-700 flex items-center gap-0.5">
                          <Tag className="w-3.5 h-3.5" />
                          {hasCoupon ? ecomSummary.coupon.code : 'הנחה'} -₪{ecomSummary.discount}
                        </span>
                      )}
                    </span>
                    <span className="text-xl font-bold text-[#581E83] tabular-nums">₪{ecomSummary.total}</span>
                  </div>
                )}
              </div>

              {/* Calendar + Contact buttons side by side */}
              <div className="grid grid-cols-2 gap-2">
                {calendarUrl && (
                  <a
                    href={calendarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 bg-[#5E2F88] hover:bg-[#7B3DB0] text-white font-medium py-2.5 rounded-xl text-[14px] transition-colors"
                  >
                    <CalendarPlus className="w-4 h-4" />
                    הוספה ליומן
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setContactOpen(true)}
                  className="flex items-center justify-center gap-2 border-2 border-[#5E2F88] text-[#5E2F88] hover:bg-[#f5f0fa] font-medium py-2.5 rounded-xl text-[14px] transition-colors"
                >
                  <HelpCircle className="w-4 h-4" />
                  יש שאלה? צרו קשר
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <DeadlineCountdown
        deadlineAt={order.deadlineAt}
        workshopStart={order.workshopStart}
        rugCount={order.rugCount}
        participantCount={participantCount}
      />

      {/* Selection mode */}
      <div className="space-y-2">
        <h3 className="text-[17px] font-bold text-[#581E83] text-center flex items-center justify-center gap-2">
          <AnimatePresence>
            {!modeChosen && (
              <motion.span
                initial={{ opacity: 1, x: 0 }}
                animate={{ x: [0, 6, 0] }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ x: { repeat: Infinity, duration: 1.2, ease: 'easeInOut' }, exit: { duration: 0.2 } }}
              >
                <MoveLeft className="lucide lucide-move-left w-5 h-5 text-[#5E2F88]" />
              </motion.span>
            )}
          </AnimatePresence>
          מי בוחר את הסקיצות?
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleModeClick('organizer')}
            className={`flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all text-right ${
              modeChosen && order.selectionMode === 'organizer'
                ? 'border-[#5E2F88] bg-[#f5f0fa] shadow-md'
                : 'border-[#e8e8e8] bg-white hover:border-[#5E2F88]/50'
            }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              modeChosen && order.selectionMode === 'organizer' ? 'bg-[#5E2F88]' : 'bg-[#f5f0fa]'
            }`}>
              <UserCheck className={`w-4 h-4 ${modeChosen && order.selectionMode === 'organizer' ? 'text-white' : 'text-[#5E2F88]'}`} />
            </div>
            <div className="min-w-0">
              <h4 className="text-[15px] font-semibold text-[#581E83]">אבחר בעצמי</h4>
              <p className="text-[14px] text-[#464646]/60 leading-tight">לכל השטיחים</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleModeClick('participants')}
            className={`flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all text-right ${
              modeChosen && order.selectionMode === 'participants'
                ? 'border-[#5E2F88] bg-[#f5f0fa] shadow-md'
                : 'border-[#e8e8e8] bg-white hover:border-[#5E2F88]/50'
            }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              modeChosen && order.selectionMode === 'participants' ? 'bg-[#5E2F88]' : 'bg-[#f5f0fa]'
            }`}>
              <Send className={`w-4 h-4 ${modeChosen && order.selectionMode === 'participants' ? 'text-white' : 'text-[#5E2F88]'}`} />
            </div>
            <div className="min-w-0">
              <h4 className="text-[15px] font-semibold text-[#581E83]">שליחה לקבוצה</h4>
              <p className="text-[14px] text-[#464646]/60 leading-tight">כל אחד יבחר לעצמו</p>
            </div>
          </button>
        </div>
      </div>

      {/* Organizer picks all sketches — card-based flow */}
      {modeChosen && order.selectionMode === 'organizer' && (
        <OrganizerSelfSelectionView
          order={order}
          catalog={catalog}
          participants={participants}
          selections={selections}
          onSelectSketch={onSelectSketch}
          onDeleteSketchSelection={onDeleteSketchSelection}
          onRequestUpgrade={onRequestUpgrade}
          onFetchCatalog={onFetchCatalog}
          editingWindowClosed={editingWindowClosed}
          onValidateImage={onValidateImage}
          onGenerateSketch={onGenerateSketch}
          onSaveApprovedSketch={onSaveApprovedSketch}
          onSubmitFeedback={onSubmitFeedback}
          onCheckRateLimit={onCheckRateLimit}
          onGetAITermsStatus={onGetAITermsStatus}
          onAcceptAITerms={onAcceptAITerms}
          onCreateGroup={onCreateGroup}
          onUpdateParticipant={onUpdateParticipant}
          onDeleteOrganizerGroup={onDeleteOrganizerGroup}
          onVerifySketchForEdit={onVerifySketchForEdit}
          onCheckGroupDeletable={onCheckGroupDeletable}
          session90={session90}
        />
      )}

      {modeChosen && order.selectionMode === 'participants' && (
        <div className="space-y-3">
          <h3 className="text-xl font-bold text-[#581E83]">קבוצות וקישורים</h3>

          {/* B: short explanatory text */}
          <div className="bg-[#f5f0fa] border border-[#5E2F88]/15 rounded-xl p-3 text-[14px] text-[#464646] leading-relaxed">
            צרו קבוצה לכל אדם או קבוצת אנשים. לכל קבוצה ייווצר קישור ייעודי שתוכלו לשלוח, וכל אחד יבחר את הסקיצות שלו בעצמו. ניתן ליצור קבוצות עד שכל השטיחים מוקצים.
          </div>

          {/* Allocation summary — live remaining counters */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#f5f0fa] rounded-xl p-2.5 text-center">
              <LayoutGrid className="w-4 h-4 text-[#5E2F88] mx-auto mb-1" />
              <p className="text-lg font-bold text-[#581E83] tabular-nums leading-none">{usedRugs}/{maxRugs}</p>
              <p className="text-[14px] text-[#464646]/60 mt-0.5">שטיחים מוקצים</p>
              {remainingRugs > 0 && <p className="text-[13px] text-orange-600 font-semibold mt-0.5">נותרו {remainingRugs}</p>}
              {remainingRugs === 0 && usedRugs > 0 && (
                <p className="text-[13px] text-green-600 font-semibold mt-0.5 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5" />
                </p>
              )}
            </div>
            <div className="bg-[#f5f0fa] rounded-xl p-2.5 text-center">
              <Users className="w-4 h-4 text-[#5E2F88] mx-auto mb-1" />
              <p className="text-lg font-bold text-[#581E83] tabular-nums leading-none">{(participants || []).length}</p>
              <p className="text-[14px] text-[#464646]/60 mt-0.5">קבוצות</p>
            </div>
            <div className="bg-[#f5f0fa] rounded-xl p-2.5 text-center">
              <Baby className="w-4 h-4 text-[#5E2F88] mx-auto mb-1" />
              <p className="text-lg font-bold text-[#581E83] tabular-nums leading-none">{usedChildren}/{maxChildren}</p>
              <p className="text-[14px] text-[#464646]/60 mt-0.5">ילדים מוקצים</p>
              {remainingChildren > 0 && <p className="text-[13px] text-orange-600 font-semibold mt-0.5">נותרו {remainingChildren}</p>}
              {remainingChildren === 0 && maxChildren > 0 && (
                <p className="text-[13px] text-green-600 font-semibold mt-0.5 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5" />
                </p>
              )}
            </div>
          </div>

          {/* Settings — apply across all groups */}
          <div className="border border-[#e8e8e8] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="w-full flex items-center justify-between p-3 text-[17px] font-medium text-[#581E83] hover:bg-[#fafafa] transition-colors"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                <span>הגדרות קבוצות</span>
              </div>
              {settingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {settingsOpen && (
              <div className="p-3 pt-0 space-y-3 border-t border-[#e8e8e8]">
                <p className="text-[13px] text-[#464646]/60 pt-2">ההגדרות חלות על כל הקבוצות</p>
                <label className="flex items-center justify-between">
                  <span className="text-[17px] text-[#464646]">הצגת עלות הסדנה למשתתפים</span>
                  <input
                    type="checkbox"
                    checked={order.showPriceToParticipants === true}
                    onChange={(e) => onUpdateSettings({ showPriceToParticipants: e.target.checked })}
                    className="w-4 h-4 accent-[#5E2F88]"
                  />
                </label>
                <label className="flex items-center justify-between">
                  <span className="text-[17px] text-[#464646]">התראה כשמשתתף משלים בחירה</span>
                  <input
                    type="checkbox"
                    checked={order.notifyOnSelection === true}
                    onChange={(e) => onUpdateSettings({ notifyOnSelection: e.target.checked })}
                    className="w-4 h-4 accent-[#5E2F88]"
                  />
                </label>
              </div>
            )}
          </div>

          {/* C: create-group CTA */}
          <button
            type="button"
            onClick={openCreate}
            disabled={remainingRugs <= 0}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[15px] font-semibold transition-colors ${
              remainingRugs > 0
                ? 'bg-[#5E2F88] hover:bg-[#7B3DB0] text-white'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            {remainingRugs > 0 ? `יצירת קבוצה · נותרו ${remainingRugs} שטיחים` : 'כל השטיחים הוקצו'}
          </button>

          {/* Group list */}
          {(participants || []).length > 0 && (() => {
            const visibleParticipants = participantsExpanded ? participants : participants.slice(0, 4);
            const hasHidden = participants.length > 4 && !participantsExpanded;

            return (
              <div className="space-y-2.5 relative">
                {visibleParticipants.map((p, i) => {
                  const link = participantLinks?.find(l => l.participantId === p._id);
                  const childCount = p.childrenCount || 0;
                  const rugCount = p.rugAllowance || 0;
                  const hasName = !!(p.name && p.name.trim());

                  const groupSelections = (selections || []).filter(
                    s => s.participantId === p._id && s.selectionStatus === 'selected'
                      && (!selectionWants90Upgrade(s) || s.upgradePaymentStatus === 'paid')
                  );
                  const rugNeeded = rugCount;
                  const completed = rugNeeded > 0 && groupSelections.length >= rugNeeded;

                  let badgeInfo;
                  if (groupSelections.length === 0) badgeInfo = { label: 'לא הושלם', bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' };
                  else if (groupSelections.length < rugNeeded) badgeInfo = { label: 'הושלם חלקית', bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' };
                  else badgeInfo = { label: 'הושלם', bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' };

                  const canShare = hasName && !!link;

                  return (
                    <div
                      key={p._id || i}
                      className={`bg-white rounded-xl border-2 p-3.5 transition-all ${
                        completed ? 'border-green-200' : 'border-[#e8e8e8]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            completed ? 'bg-green-100 text-green-700' : 'bg-[#f5f0fa] text-[#5E2F88]'
                          }`}>
                            {completed ? <Check className="w-3.5 h-3.5" /> : i + 1}
                          </div>
                          <span className="text-[15px] font-semibold text-[#581E83] truncate">{p.name}</span>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badgeInfo.bg} ${badgeInfo.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${badgeInfo.dot}`} />
                            {badgeInfo.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {link && (
                            <button
                              type="button"
                              onClick={() => { if (canShare) setShareFor(p); }}
                              disabled={!canShare}
                              className={`flex items-center gap-1 text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors ${
                                canShare
                                  ? 'bg-[#5E2F88] hover:bg-[#7B3DB0] text-white'
                                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                              }`}
                            >
                              <Send className="w-3.5 h-3.5" />
                              שליחה
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => askDelete(p)}
                            disabled={within48h}
                            title={within48h ? 'לא ניתן למחוק בתוך 48 שעות מהסדנה' : 'מחיקת קבוצה'}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                              within48h
                                ? 'text-gray-300 cursor-not-allowed'
                                : 'text-red-400 hover:text-red-600 hover:bg-red-50'
                            }`}
                          >
                            {within48h ? <Lock className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Read-only allocation */}
                      <div className="flex items-center gap-4 mt-2 mb-0.5">
                        <span className="flex items-center gap-1.5 text-[14px] text-[#464646]/50">
                          <LayoutGrid className="w-3.5 h-3.5 text-[#5E2F88]" />
                          {rugCount} {rugCount === 1 ? 'שטיח' : 'שטיחים'}
                        </span>
                        {childCount > 0 && (
                          <span className="flex items-center gap-1.5 text-[14px] text-[#464646]/50">
                            <Baby className="w-3.5 h-3.5 text-[#5E2F88]" />
                            {childCount} {childCount === 1 ? 'ילד' : 'ילדים'}
                          </span>
                        )}
                      </div>

                      {/* Sketches the participant selected via their own link */}
                      {groupSelections.length > 0 && (
                        <div className="space-y-1.5 mt-1.5">
                          {groupSelections.map((sel, si) => {
                            const badge = getSelectionStatusBadge(sel, editingWindowClosed);
                            return (
                              <div key={sel._id || si} className="flex items-center gap-2.5 bg-[#fafafa] rounded-lg p-2">
                                {sel.productSnapshot?.image && (
                                  <EnlargeableSketchImage
                                    src={sel.productSnapshot.image}
                                    alt={sel.productSnapshot?.title || 'סקיצה'}
                                    thumbClassName="w-10 h-10"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-[#581E83] truncate">
                                    {sel.productSnapshot?.title || 'סקיצה'}
                                    {sel.participantName && <span className="text-[#464646]/50 font-normal"> · {sel.participantName}</span>}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <span className="text-[11px] text-[#464646]/50">
                                      {getSelectionDisplaySize(sel) === '90x90' ? '90×90 ס"מ' : '60×60 ס"מ'}
                                    </span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${badge.bg} ${badge.text}`}>
                                      {badge.icon && <Lock className="w-2.5 h-2.5" />}
                                      {badge.label}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {hasHidden && (
                  <div className="relative">
                    <div className="absolute inset-x-0 -top-16 h-16 bg-gradient-to-t from-white to-transparent pointer-events-none" />
                    <button
                      type="button"
                      onClick={() => setParticipantsExpanded(true)}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-[#5E2F88] hover:text-[#7B3DB0] transition-colors"
                    >
                      <ChevronDown className="w-4 h-4" />
                      הצג עוד {participants.length - 4} קבוצות
                    </button>
                  </div>
                )}
                {participantsExpanded && participants.length > 4 && (
                  <button
                    type="button"
                    onClick={() => setParticipantsExpanded(false)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-[#464646]/60 hover:text-[#5E2F88] transition-colors"
                  >
                    <ChevronDown className="w-4 h-4 rotate-180" />
                    הצג פחות
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Create group modal */}
      <AnimatePresence>
        {createOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => !creating && setCreateOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4 relative"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => !creating && setCreateOpen(false)}
                className="absolute top-3 left-3 text-[#464646]/50 hover:text-[#464646] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center">
                <div className="w-11 h-11 rounded-full bg-[#f5f0fa] flex items-center justify-center mx-auto mb-2">
                  <UserPlus className="w-6 h-6 text-[#5E2F88]" />
                </div>
                <h3 className="text-[19px] font-bold text-[#581E83]">יצירת קבוצה חדשה</h3>
                <p className="text-[14px] text-[#464646]/70 mt-1">
                  נותרו {remainingRugs} {remainingRugs === 1 ? 'משתתף' : 'משתתפים'}
                  {maxChildren > 0 && ` · ${remainingChildren} ${remainingChildren === 1 ? 'ילד' : 'ילדים'}`}
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[14px] font-medium text-[#464646] mb-1">שם הקבוצה</label>
                  <input
                    type="text"
                    autoFocus
                    value={newGroupName}
                    onChange={(e) => { setNewGroupName(e.target.value); setCreateError(''); }}
                    placeholder="לדוגמה: משפחת כהן"
                    className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-[15px] focus:border-[#5E2F88] focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[15px] text-[#464646]">
                    <Users className="w-4 h-4 text-[#5E2F88]" />
                    מספר משתתפים
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setNewGroupSeats(v => Math.max(1, v - 1))}
                      disabled={newGroupSeats <= 1}
                      className="w-7 h-7 rounded-full border border-[#e8e8e8] flex items-center justify-center text-[#5E2F88] hover:bg-[#f5f0fa] disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[15px] font-bold text-[#581E83] tabular-nums w-6 text-center">{newGroupSeats}</span>
                    <button
                      type="button"
                      onClick={() => setNewGroupSeats(v => Math.min(remainingRugs, v + 1))}
                      disabled={newGroupSeats >= remainingRugs}
                      className="w-7 h-7 rounded-full border border-[#e8e8e8] flex items-center justify-center text-[#5E2F88] hover:bg-[#f5f0fa] disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {maxChildren > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[15px] text-[#464646]">
                      <Baby className="w-4 h-4 text-[#5E2F88]" />
                      מתוכם ילדים
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setNewGroupChildren(v => Math.max(minChildrenForCreate, v - 1))}
                        disabled={newGroupChildren <= minChildrenForCreate}
                        className="w-7 h-7 rounded-full border border-[#e8e8e8] flex items-center justify-center text-[#5E2F88] hover:bg-[#f5f0fa] disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[15px] font-bold text-[#581E83] tabular-nums w-6 text-center">{newGroupChildren}</span>
                      <button
                        type="button"
                        onClick={() => setNewGroupChildren(v => Math.min(remainingChildren, v + 1))}
                        disabled={newGroupChildren >= remainingChildren}
                        className="w-7 h-7 rounded-full border border-[#e8e8e8] flex items-center justify-center text-[#5E2F88] hover:bg-[#f5f0fa] disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-[13px] text-[#464646]/50 flex items-center gap-1.5">
                  <LayoutGrid className="w-3.5 h-3.5 text-[#5E2F88]" />
                  יוקצו אוטומטית {newGroupSeats} {newGroupSeats === 1 ? 'שטיח' : 'שטיחים'} לקבוצה זו
                </p>

                {minChildrenForCreate > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-[13px] text-orange-700 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      יש לשייך לפחות {minChildrenForCreate} {minChildrenForCreate === 1 ? 'ילד' : 'ילדים'} לקבוצה זו.
                      {' '}אחרת ייוותרו {remainingRugs - newGroupSeats} {(remainingRugs - newGroupSeats) === 1 ? 'מבוגר' : 'מבוגרים'} ו-{remainingChildren - newGroupChildren} ילדים — מספר הילדים יעלה על המבוגרים.
                    </span>
                  </div>
                )}

                {/* Auto-allocation preview */}
                {(() => {
                  const rugsAfter = remainingRugs - newGroupSeats;
                  const childrenAfter = remainingChildren - newGroupChildren;
                  if (rugsAfter === 0 && childrenAfter > 0 && maxChildren > 0) {
                    return (
                      <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-[13px] text-orange-700">
                        <p className="font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          הקצאת ילדים אוטומטית
                        </p>
                        <p className="mt-1">
                          נותרו {childrenAfter} {childrenAfter === 1 ? 'ילד' : 'ילדים'} שלא הוקצו.
                          בשמירה, הם יחולקו אוטומטית בין הקבוצות לפי מספר המבוגרים.
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}

                {createError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[13px] text-red-700">
                    {createError}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={submitCreate}
                disabled={creating || !newGroupName.trim()}
                className="w-full flex items-center justify-center gap-2 bg-[#5E2F88] hover:bg-[#7B3DB0] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-[15px] transition-colors"
              >
                {creating ? 'שומר...' : (<><Send className="w-4 h-4" /> שמירה ושליחה</>)}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete blocked — sketch in preparation/ready */}
      <AnimatePresence>
        {deleteBlockedInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setDeleteBlockedInfo(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4 relative"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-2">
                  <Lock className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-[19px] font-bold text-[#581E83]">לא ניתן למחוק את הקבוצה</h3>
                <p className="text-[14px] text-[#464646]/80 mt-2">
                  {deleteBlockedInfo.generic ? (
                    'לא הצלחנו לאמת את סטטוס הסקיצות. נסו שוב.'
                  ) : (
                    <>
                      בקבוצה <strong>"{deleteBlockedInfo.groupName}"</strong> יש סקיצה בסטטוס{' '}
                      <span className="font-semibold text-[#581E83]">"{getSketchStatusLabel(deleteBlockedInfo.status)}"</span>.
                      לא ניתן למחוק את הקבוצה כל עוד סקיצה בסטטוס זה.
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteBlockedInfo(null)}
                className="w-full border-2 border-[#e8e8e8] text-[#464646] font-medium py-2.5 rounded-xl text-[14px] hover:bg-[#fafafa] transition-colors"
              >
                סגירה
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete group confirmation */}
      <AnimatePresence>
        {deleteFor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => !deleting && setDeleteFor(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4 relative"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-2">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-[19px] font-bold text-red-700">מחיקת הקבוצה "{deleteFor.name}"?</h3>
                <div className="text-[14px] text-[#464646]/80 mt-2 space-y-2 text-right">
                  <p>מחיקת הקבוצה יבטל לצמיתות את הקישור שלה — הוא יפסיק לעבוד עבור מי שקיבל אותו.</p>
                  <p className="font-semibold text-red-600">כל הסקיצות שכבר נבחרו על ידי אותה קבוצה יימחקו.</p>
                  <p>תוכלו תמיד ליצור קבוצה חדשה במקומה.</p>
                </div>
              </div>

              {deleteError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[13px] text-red-700">
                  {deleteError}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { if (!deleting) setDeleteFor(null); }}
                  className="flex-1 border-2 border-[#e8e8e8] text-[#464646] font-medium py-2.5 rounded-xl text-[14px] hover:bg-[#fafafa] transition-colors"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-[14px] transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  {deleting ? 'מוחק...' : 'מחק לצמיתות'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mode switch warning */}
      <AnimatePresence>
        {modeSwitchTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => !modeSwitching && setModeSwitchTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4 relative"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-11 h-11 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-2">
                  <AlertTriangle className="w-6 h-6 text-orange-600" />
                </div>
                <h3 className="text-[19px] font-bold text-[#581E83]">שינוי שיטת בחירה</h3>
                <div className="text-[14px] text-[#464646]/80 mt-2 space-y-2 text-right">
                  <p>ניתן להשתמש רק בשיטת בחירה אחת.</p>
                  <p className="font-semibold text-red-600">
                    מעבר ל{modeSwitchTarget === 'organizer' ? '״אבחר בעצמי״' : '״שליחה לקבוצה״'} ימחק את כל הקבוצות והסקיצות שנבחרו עד כה.
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { if (!modeSwitching) setModeSwitchTarget(null); }}
                  className="flex-1 border-2 border-[#e8e8e8] text-[#464646] font-medium py-2.5 rounded-xl text-[14px] hover:bg-[#fafafa] transition-colors"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={confirmModeSwitch}
                  disabled={modeSwitching}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-[14px] transition-colors"
                >
                  {modeSwitching ? 'מחליף...' : 'אישור ומעבר'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mode switch blocked — sketch already in preparation/ready */}
      <AnimatePresence>
        {modeSwitchLockedInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setModeSwitchLockedInfo(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4 relative"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-2">
                  <Lock className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-[19px] font-bold text-[#581E83]">לא ניתן לשנות את אופן הבחירה</h3>
                <div className="text-[14px] text-[#464646]/80 mt-2 space-y-2 text-right">
                  <p>
                    אחת הסקיצות נמצאת כבר בסטטוס <span className="font-semibold text-[#581E83]">״{modeSwitchLockedInfo.status}״</span>,
                    ולכן לא ניתן לשנות את שיטת הבחירה.
                  </p>
                  <p>אם בכל זאת תרצו לשנות את אופן הבחירה, יש לפנות לשירות עם פרטי ההזמנה שלכם.</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModeSwitchLockedInfo(null)}
                  className="flex-1 border-2 border-[#e8e8e8] text-[#464646] font-medium py-2.5 rounded-xl text-[14px] hover:bg-[#fafafa] transition-colors"
                >
                  סגירה
                </button>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1ebe5a] text-white font-semibold py-2.5 rounded-xl text-[14px] transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  פנייה בוואטסאפ
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Group share popup */}
      <AnimatePresence>
        {shareFor && shareFor.name && shareFor.name.trim() && (() => {
          const link = participantLinks?.find(l => l.participantId === shareFor._id);
          const token = link?.token;
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              onClick={() => setShareFor(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4 relative"
                dir="rtl"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setShareFor(null)}
                  className="absolute top-3 left-3 text-[#464646]/50 hover:text-[#464646] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="text-center">
                  <Send className="w-9 h-9 text-[#5E2F88] mx-auto mb-2" />
                  <h3 className="text-[19px] font-bold text-[#581E83]">שליחת קישור ל{shareFor.name}</h3>
                  <p className="text-[14px] text-[#464646]/70 mt-1">
                    {(shareFor.rugAllowance || 0)} {(shareFor.rugAllowance || 0) === 1 ? 'שטיח' : 'שטיחים'}
                    {(shareFor.childrenCount || 0) > 0 && ` · ${shareFor.childrenCount} ${shareFor.childrenCount === 1 ? 'ילד' : 'ילדים'}`}
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => { shareViaWhatsApp(token, shareFor); setShareFor(null); }}
                    className="flex items-center gap-3 w-full p-3.5 rounded-xl border-2 border-[#e8e8e8] bg-white hover:border-green-400 hover:bg-green-50 transition-colors text-right"
                  >
                    <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                      <MessageCircle className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[16px] font-semibold text-[#464646]">שיתוף בוואטסאפ</span>
                      <p className="text-[13px] text-[#464646]/60 mt-0.5">שלחו את הקישור בהודעה</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-[#464646]/40 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => { shareViaEmail(token, shareFor); setShareFor(null); }}
                    className="flex items-center gap-3 w-full p-3.5 rounded-xl border-2 border-[#e8e8e8] bg-white hover:border-[#5E2F88] hover:bg-[#f5f0fa] transition-colors text-right"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#5E2F88] flex items-center justify-center shrink-0">
                      <Mail className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[16px] font-semibold text-[#464646]">שליחה במייל</span>
                      <p className="text-[13px] text-[#464646]/60 mt-0.5">פתחו אימייל עם הקישור</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-[#464646]/40 shrink-0" />
                  </button>

                  <div className="rounded-xl border-2 border-[#e8e8e8] bg-white overflow-hidden">
                    <button
                      type="button"
                      onClick={() => copyLink(token, shareFor._id, shareFor)}
                      className="flex items-center gap-3 w-full p-3.5 hover:bg-[#f5f0fa] transition-colors text-right"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#f5f0fa] flex items-center justify-center shrink-0">
                        {copiedLink === shareFor._id ? <Check className="w-5 h-5 text-green-600" /> : <Link2 className="w-5 h-5 text-[#5E2F88]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[16px] font-semibold text-[#464646]">{copiedLink === shareFor._id ? 'הועתק!' : 'העתקת קישור'}</span>
                        <p className="text-[13px] text-[#464646]/60 mt-0.5">העתיקו ושתפו בכל מקום</p>
                      </div>
                      <Copy className="w-4 h-4 text-[#464646]/40 shrink-0" />
                    </button>
                    <label
                      className="flex items-center gap-2 px-3.5 pb-3 pt-0 cursor-pointer select-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setCopyWithDetails(v => !v); }}
                        className="text-[#5E2F88]"
                      >
                        {copyWithDetails ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                      <span className="text-[13px] text-[#464646]/70">העתקה עם פרטי הסדנה</span>
                    </label>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Contact popup */}
      <AnimatePresence>
        {contactOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setContactOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4 relative"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setContactOpen(false)}
                className="absolute top-3 left-3 text-[#464646]/50 hover:text-[#464646] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center">
                <HelpCircle className="w-10 h-10 text-[#5E2F88] mx-auto mb-2" />
                <h3 className="text-[19px] font-bold text-[#581E83]">איך נוכל לעזור?</h3>
                <p className="text-[15px] text-[#464646]/70 mt-1">בחרו את הדרך הנוחה לכם</p>
              </div>

              <div className="space-y-3">
                <a
                  href="/faq"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 w-full p-3.5 rounded-xl border-2 border-[#5E2F88] bg-[#f5f0fa] hover:bg-[#ebe0f5] transition-colors text-right"
                >
                  <div className="w-10 h-10 rounded-full bg-[#5E2F88] flex items-center justify-center shrink-0">
                    <HelpCircle className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[17px] font-semibold text-[#581E83]">שאלות נפוצות</span>
                      <span className="text-[11px] font-bold bg-[#5E2F88] text-white px-2 py-0.5 rounded-full">מומלץ</span>
                    </div>
                    <p className="text-[14px] text-[#464646]/60 mt-0.5">מצאו תשובות מהירות</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-[#5E2F88] shrink-0" />
                </a>

                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 w-full p-3.5 rounded-xl border-2 border-[#e8e8e8] bg-white hover:border-green-400 hover:bg-green-50 transition-colors text-right"
                >
                  <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                    <MessageCircle className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[17px] font-semibold text-[#464646]">WhatsApp</span>
                    <p className="text-[14px] text-[#464646]/60 mt-0.5">שלחו לנו הודעה</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-[#464646]/40 shrink-0" />
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
