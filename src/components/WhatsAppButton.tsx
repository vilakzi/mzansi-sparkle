import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

interface WhatsAppButtonProps {
  phoneNumber: string;
  displayName: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function WhatsAppButton({ 
  phoneNumber, 
  displayName, 
  variant = "default",
  size = "default",
  className 
}: WhatsAppButtonProps) {
  const handleWhatsAppClick = () => {
    // Remove all non-numeric characters from phone number
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    // Create WhatsApp URL with pre-filled message
    const message = `Hi ${displayName}! I found you on the app.`;
    const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
    
    // Open WhatsApp in new tab
    window.open(whatsappUrl, '_blank');
  };

  if (!phoneNumber) {
    return null;
  }

  return (
    <Button 
      onClick={handleWhatsAppClick}
      variant={variant}
      size={size}
      className={className}
    >
      <MessageCircle className="h-4 w-4 mr-2" />
      WhatsApp
    </Button>
  );
}
