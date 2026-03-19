"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import { cn } from "@/lib/shared/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "antd";

interface ProductImageGalleryProps {
  images: string[];
  productName: string;
}

export function ProductImageGallery({ images, productName }: ProductImageGalleryProps) {
  const validImages = images.filter(Boolean);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });

  const scrollTo = useCallback(
    (index: number) => {
      if (emblaApi) emblaApi.scrollTo(index);
    },
    [emblaApi]
  );

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    onSelect();
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  if (validImages.length === 0) {
    return (
      <div className="aspect-square bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
        Нет фото
      </div>
    );
  }

  if (validImages.length === 1) {
    return (
      <div className="relative aspect-square bg-muted rounded-lg overflow-hidden">
        <Image
          src={validImages[0]}
          alt={productName}
          fill
          className="object-cover"
          priority
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Main image carousel */}
      <div className="relative rounded-lg overflow-hidden">
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex">
            {validImages.map((src, index) => (
              <div key={index} className="flex-[0_0_100%] min-w-0">
                <div className="relative aspect-square bg-muted">
                  <Image
                    src={src}
                    alt={`${productName} - ${index + 1}`}
                    fill
                    className="object-cover"
                    priority={index === 0}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation arrows */}
        <Button
          type="text"
          shape="circle"
          className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm hover:bg-background/90 h-9 w-9"
          onClick={() => emblaApi?.scrollPrev()}
          icon={<ChevronLeft className="h-5 w-5" />}
        />
        <Button
          type="text"
          shape="circle"
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm hover:bg-background/90 h-9 w-9"
          onClick={() => emblaApi?.scrollNext()}
          icon={<ChevronRight className="h-5 w-5" />}
        />

        {/* Counter */}
        <div className="absolute bottom-3 right-3 bg-background/80 backdrop-blur-sm text-xs px-2 py-1 rounded-full">
          {selectedIndex + 1} / {validImages.length}
        </div>
      </div>

      {/* Thumbnails */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {validImages.map((src, index) => (
          <button
            key={index}
            onClick={() => scrollTo(index)}
            className={cn(
              "relative w-16 h-16 rounded-md overflow-hidden shrink-0 border-2 transition-colors",
              selectedIndex === index
                ? "border-primary"
                : "border-transparent hover:border-muted-foreground/30"
            )}
          >
            <Image
              src={src}
              alt={`${productName} - thumbnail ${index + 1}`}
              fill
              className="object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
