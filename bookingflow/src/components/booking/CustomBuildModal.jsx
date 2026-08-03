import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Upload, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Helper to send custom build request to Wix parent
const sendCustomBuildToWix = (data) => {
  try {
    window.parent.postMessage({ type: 'CUSTOM_BUILD_REQUEST', data }, '*');
  } catch (e) {
  }
};

export default function CustomBuildModal({ isOpen, onClose }) {
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    email: '',
    message: '',
    dimensions: '',
    wood_preference: 'no_preference',
    marketing_consent: false
  });
  const [files, setFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Note: File uploads would need to be handled by Wix
    const requestData = {
      ...formData,
      attachments: files.map(f => f.name),
      request_type: 'custom_build',
      status: 'new'
    };

    sendCustomBuildToWix(requestData);

    // Simulate success
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
      dimensions: '',
      wood_preference: 'no_preference',
      marketing_consent: false
    });
    setFiles([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
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
              <h3 className="text-xl font-semibold text-[#581E83] mb-2">אנחנו בודקים את פרטי הבקשה שלך</h3>
              <p className="text-[#464646] mb-6">נחזור אליך בהקדם האפשרי עד 24 שעות</p>
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
                <DialogTitle className="text-[#581E83] text-right">אני רוצה לבנות משהו משלי</DialogTitle>
              </DialogHeader>

              {/* הסבר על התהליך */}
              <div className="mt-4 p-3 bg-[#5E2F88]/10 border border-[#5E2F88]/30 rounded-lg">
                <h4 className="font-medium text-[#581E83] text-sm mb-2">התהליך:</h4>
                <ol className="text-xs text-[#464646] space-y-1.5 mr-4" style={{ listStyleType: 'decimal' }}>
                  <li>מלאו את הפרטים בטופס</li>
                  <li>נבדוק את הבקשה ונתאים מסלול אישי (במידת האפשר)</li>
                  <li>נשלח לכם קישור לבחירת תאריך + מחיר וכמות מפגשים</li>
                  <li>תוכלו לשלם ולהתחיל ליצור!</li>
                </ol>
              </div>

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
                  <Label>העלאת תמונה/סרטון של הרעיון (אופציונלי)</Label>
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

                <div>
                  <Label htmlFor="message">תאר/י מה תרצה לבנות *</Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    required
                    placeholder="ספרו לנו על הפרויקט שחלמתם עליו..."
                    className="mt-1 min-h-[100px]"
                  />
                </div>

                <div>
                  <Label htmlFor="dimensions">מידות (אופציונלי)</Label>
                  <Input
                    id="dimensions"
                    value={formData.dimensions}
                    onChange={(e) => setFormData({ ...formData, dimensions: e.target.value })}
                    placeholder="למשל: 120x60x45 ס״מ"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>סוג עץ מועדף *</Label>
                  <RadioGroup
                    value={formData.wood_preference}
                    onValueChange={(value) => setFormData({ ...formData, wood_preference: value })}
                    className="mt-2 space-y-2"
                  >
                    <div className="flex items-center gap-2 flex-row-reverse justify-end">
                      <Label htmlFor="recycled" className="font-normal">עץ ממוחזר</Label>
                      <RadioGroupItem value="recycled" id="recycled" />
                    </div>
                    <div className="flex items-center gap-2 flex-row-reverse justify-end">
                      <Label htmlFor="new" className="font-normal">עץ חדש</Label>
                      <RadioGroupItem value="new" id="new" />
                    </div>
                    <div className="flex items-center gap-2 flex-row-reverse justify-end">
                      <Label htmlFor="no_preference" className="font-normal">לא משנה לי</Label>
                      <RadioGroupItem value="no_preference" id="no_preference" />
                    </div>
                  </RadioGroup>
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