import { useEffect, useState } from "react";
import { useSosReconcile } from "../context/SosReconcileContext";
import { resolveAnonymousReconcileOffer } from "../services/anonymousSosSession";

export type AnonymousSosLinkBannerState = {
    visible: boolean;
    isActive: boolean;
    requestId: number | null;
};

const HIDDEN: AnonymousSosLinkBannerState = {
    visible: false,
    isActive: false,
    requestId: null,
};

export function useAnonymousSosLinkBanner(enabled: boolean): AnonymousSosLinkBannerState {
    const { reconcileModalOpen, reconcileGeneration } = useSosReconcile();
    const [state, setState] = useState<AnonymousSosLinkBannerState>(HIDDEN);

    useEffect(() => {
        if (!enabled || reconcileModalOpen) {
            setState(HIDDEN);
            return;
        }

        let cancelled = false;

        void resolveAnonymousReconcileOffer().then((offer) => {
            if (cancelled) {
                return;
            }

            if (offer.kind === "prompt") {
                setState({
                    visible: true,
                    isActive: offer.isActive,
                    requestId: offer.session.request_id,
                });
                return;
            }

            setState(HIDDEN);
        });

        return () => {
            cancelled = true;
        };
    }, [enabled, reconcileModalOpen, reconcileGeneration]);

    return state;
}
