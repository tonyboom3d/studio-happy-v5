import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Helper to send consultation request to Wix parent
const sendConsultationToWix = (data) => {
  try {
    window.parent.postMessage({ type: 'CONSULTATION_REQUEST', data }, '*');
  } catch (e) {
  }
};

export default function ConsultationModal({ isOpen, onClose }) {
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    email: '',
    message: '',
    marketing_consent: false
  });
  const [files, setFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Note: File uploads would need to be handled by Wix
    // For now, just send the form data
    const requestData = {
      ...formData,
      attachments: files.map(f => f.name), // Just file names for now
      request_type: 'consultation',
      status: 'new'
    };

    sendConsultationToWix(requestData);

    // Simulate success (Wix will handle actual saving)
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
    }, 1000);
  };

  const handleClose = () => {
    setIsSuccess(false);
    setFormData({
      full_name: '',
      phone: '',
      email: '',
      message: '',
      marketing_consent: false
    });
    setFiles([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <AnimatePresence mode="wait">
          {isSuccess ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-[#5E2F88] flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-[#581E83] mb-2">קיבלנו את הפנייה שלך!</h3>
              <p className="text-[#464646] mb-6">עושים מאמץ לענות לך בהקדם האפשרי</p>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={handleClose}>
                  סגירת חלון
                </Button>
                <Button
                  className="bg-[#5E2F88] hover:bg-[#7B3DB0]"
                  onClick={handleClose}
                >
                  חזרה להזמנה
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <DialogHeader>
                <DialogTitle className="text-[#581E83] text-right">אשמח להתייעץ</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="full_name">שם מלא *</Label>
                  <Input
                    id="full_name"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    required
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="phone">טלפון *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                    className="mt-1 text-left"
                  />
                </div>

                <div>
                  <Label htmlFor="email">אימייל *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    className="mt-1 text-left"
                  />
                </div>

                <div>
                  <Label htmlFor="message">מה תרצה להתייעץ? *</Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    required
                    className="mt-1 min-h-[100px]"
                  />
                </div>

                <div>
                  <Label>העלאת תמונות/סרטון (אופציונלי)</Label>
                  <div className="mt-1">
                    <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-[#e8e8e8] rounded-lg cursor-pointer hover:border-[#5E2F88] transition-colors">
                      <Upload className="w-5 h-5 text-[#464646]" />
                      <span className="text-sm text-[#464646]">
                        {files.length > 0 ? `${files.length} קבצים נבחרו` : 'לחץ לבחירת קבצים'}
                      </span>
                      <input
                        type="file"
                        multiple
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={(e) => setFiles(Array.from(e.target.files))}
                      />
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="marketing"
                    checked={formData.marketing_consent}
                    onCheckedChange={(checked) => setFormData({ ...formData, marketing_consent: checked })}
                  />
                  <Label htmlFor="marketing" className="text-sm font-normal">
                    אני מאשר/ת קבלת עדכונים ודיוור
                  </Label>
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#5E2F88] hover:bg-[#7B3DB0]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin ml-2" />
                      שולח...
                    </>
                  ) : 'שליחה'}
                </Button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}