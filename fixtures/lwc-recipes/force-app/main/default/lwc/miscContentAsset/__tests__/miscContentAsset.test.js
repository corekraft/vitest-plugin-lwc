import { createElement } from '@lwc/engine-dom';
import MiscContentAsset from 'c/miscContentAsset';

describe('c-misc-content-asset', () => {
    function normalizeResourcePath(value) {
        return value.replace(/^https?:\/\/localhost(?::\d+)?\//, '');
    }

    afterEach(() => {
        // The jsdom instance is shared across test cases in a single file so reset the DOM
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('sets img url based on content asset', () => {
        // Create component
        const element = createElement('c-misc-content-asset', {
            is: MiscContentAsset
        });
        document.body.appendChild(element);

        // Query for img element that uses a content asset
        const imgRecipesEl = element.shadowRoot.querySelector(
            'img[alt="Recipes logo"]'
        );
        expect(imgRecipesEl).not.toBeNull();
        // sfdx-lwc-jest automocks @salesforce/contentAsset, and returns localhost/name_of_content_asset.
        expect(normalizeResourcePath(imgRecipesEl.src)).toBe(
            'recipes_sq_logo'
        );
    });

    it('is accessible', async () => {
        const element = createElement('c-misc-content-asset', {
            is: MiscContentAsset
        });
        document.body.appendChild(element);

        // Check accessibility
        await expect(element).toBeAccessible();
    });
});
