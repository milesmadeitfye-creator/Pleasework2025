import { useEffect, useMemo, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";

function useIsCoarsePointer() {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  return coarse;
}

export default function LandingShowcaseSlider() {
  const isCoarse = useIsCoarsePointer();

  // Desktop: autoplay ON. Mobile: autoplay OFF so swiping is clean.
  const autoplay = useMemo(
    () => (isCoarse ? false : { delay: 2600, disableOnInteraction: false }),
    [isCoarse]
  );

  return (
    <div className="showcaseSliderWrap">
      <Swiper
        modules={[Autoplay, Pagination]}
        autoplay={autoplay as any}
        pagination={{ clickable: true }}
        loop
        speed={650}
        // iOS Safari touch fixes
        touchStartPreventDefault={false}
        passiveListeners={false}
        // encourage vertical scroll while allowing horizontal swipe
        style={{ touchAction: "pan-y" }}
      >
        <SwiperSlide>
          <img className="slideImg" src="/landing/step1.png" alt="Step 1" />
        </SwiperSlide>
        <SwiperSlide>
          <img className="slideImg" src="/landing/step2.png" alt="Step 2" />
        </SwiperSlide>
        <SwiperSlide>
          <img className="slideImg" src="/landing/step3.png" alt="Step 3" />
        </SwiperSlide>
        <SwiperSlide>
          <img className="slideImg" src="/landing/step4.png" alt="Step 4" />
        </SwiperSlide>
      </Swiper>
    </div>
  );
}
