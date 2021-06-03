/*
 *                       ######
 *                       ######
 * ############    ####( ######  #####. ######  ############   ############
 * #############  #####( ######  #####. ######  #############  #############
 *        ######  #####( ######  #####. ######  #####  ######  #####  ######
 * ###### ######  #####( ######  #####. ######  #####  #####   #####  ######
 * ###### ######  #####( ######  #####. ######  #####          #####  ######
 * #############  #############  #############  #############  #####  ######
 *  ############   ############  #############   ############  #####  ######
 *                                      ######
 *                               #############
 *                               ############
 *
 * Adyen Payment Module
 *
 * Copyright (c) 2020 Adyen B.V.
 * This file is open source and available under the MIT license.
 * See the LICENSE file for more info.
 *
 */

import DomAccess from 'src/helper/dom-access.helper';
import Plugin from 'src/plugin-system/plugin.class';
import StoreApiClient from 'src/service/store-api-client.service';
import validatePaymentMethod from '../validator/paymentMethod';
import FormValidatorWithComponent from '../validator/FormValidatorWithComponent';
import adyenConfiguration from '../configuration/adyen';

/* global adyenCheckoutConfiguration, AdyenCheckout, adyenCheckoutOptions */
/* eslint-disable no-unused-vars */
export default class CheckoutPlugin extends Plugin {

    init() {
        debugger;
        const changePaymentForm = DomAccess.querySelector(document, '#changePaymentForm');
        changePaymentForm.addEventListener('submit', this.onConfirmPaymentMethod.bind(this));

        this.client = new StoreApiClient();

        const handleOnAdditionalDetails = function (state) {
            this.client.post(
                `${adyenCheckoutOptions.paymentDetailsUrl}`,
                JSON.stringify({orderId: window.orderId, stateData: state.data}),
                function (paymentAction) {
                    const paymentActionResponse = JSON.parse(paymentAction);

                    if (paymentActionResponse.isFinal) {
                        location.href = window.returnUrl;
                    }

                    try {
                        this.adyenCheckout
                            .createFromAction(paymentActionResponse.action)
                            .mount('[data-adyen-payment-action-container]');
                        $('[data-adyen-payment-action-modal]').modal({show: true});
                    } catch (e) {
                        console.log(e);
                    }
                }.bind(this)
            );
        }

        const { locale, clientKey, environment, paymentMethodsResponse } = adyenCheckoutConfiguration;
        const ADYEN_CHECKOUT_CONFIG = {
            locale,
            clientKey,
            environment,
            showPayButton: false,
            hasHolderName: true,
            paymentMethodsResponse: JSON.parse(paymentMethodsResponse),
            onAdditionalDetails: handleOnAdditionalDetails.bind(this)
        };

        this.adyenCheckout = new AdyenCheckout(ADYEN_CHECKOUT_CONFIG);

        this.placeOrderAllowed = false;
        this.data = '';
        this.storedPaymentMethodData = {};
        this.formValidator = {};
        this.currentPaymentMethodInstance = {};
        this.selectedAdyenHandler = null;

        // Render any preselected Adyen payment method
        if (adyenCheckoutOptions.selectedPaymentMethodPluginId ===
            adyenCheckoutOptions.adyenPluginId) {
            const paymentMethodContainer = $(`[data-adyen-payment-method="${adyenCheckoutOptions.selectedPaymentMethodHandler}"]`);
            this.renderPaymentMethod(paymentMethodContainer);
        }
        // Render payment method components when they are selected.
        $('[name=paymentMethodId]').on("change", this.onPaymentMethodChange.bind(this));

        // Iterate through and render the stored payment methods
        const storedPaymentMethods = this.adyenCheckout.paymentMethodsResponse.storedPaymentMethods;
        this.formValidator[adyenConfiguration.paymentMethodTypeHandlers.oneclick] = {};
        storedPaymentMethods.forEach(this.renderStoredPaymentMethod.bind(this));

        //Show the payment method's contents if it's selected by default
        $(`[data-adyen-payment-method-id="${validatePaymentMethod()}"]`).show();

        //Hiding component contents if there's already state.data saved for this PM
        adyenConfiguration.updatablePaymentMethods.forEach(element => this.hideStateData(element));

        /**
         * Shows the payment method component in order to update the previously saved details
         */
        window.showPaymentMethodDetails = function () {
            $('[data-adyen-payment-container]').show();
            $('[data-adyen-update-payment-details]').hide();
        }

        /* eslint-enable no-unused-vars */
    }

    onPaymentMethodChange(event) {
        // Unmount any previously selected paymentMethod instance
        if(!$.isEmptyObject(this.currentPaymentMethodInstance)) {
            this.currentPaymentMethodInstance.unmount();
            this.currentPaymentMethodInstance = {};
        }
        $('.adyen-payment-method-container-div').hide();
        let paymentMethodContainer = $(`[data-adyen-payment-method-id="${$(event.target).val()}"]`);

        this.renderPaymentMethod(paymentMethodContainer);

        paymentMethodContainer.show();
    }

    renderPaymentMethod(paymentMethodContainer) {
        let handler = paymentMethodContainer.data('adyenPaymentMethod');
        let type = Object.keys(adyenConfiguration.paymentMethodTypeHandlers)
            .find(key => adyenConfiguration.paymentMethodTypeHandlers[key] === handler);

        // Get the payment method object from paymentMethodsResponse
        let filtered = $.grep(this.adyenCheckout.paymentMethodsResponse.paymentMethods, function(paymentMethod) {
            return paymentMethod.type === type;
        });
        if (filtered.length === 0) {
            return false;
        }
        let paymentMethod = filtered[0];

        if (paymentMethod.type in adyenConfiguration.componentsWithPayButton) {
            // For payment methods with a direct pay button, the button is rendered on the confirm page
            return false;
        }

        // Mount payment method instance
        const configuration = Object.assign(paymentMethod, {
            onChange: this.onPaymentComponentChange.bind(this)
        });

        if (paymentMethod.type === 'scheme') {
            configuration.enableStoreDetails = true;
        }

        try {
            this.currentPaymentMethodInstance = this.adyenCheckout.create(paymentMethod.type, configuration);
            this.currentPaymentMethodInstance.mount(paymentMethodContainer.find('[data-adyen-payment-container]').get(0));
            this.formValidator[handler] = new FormValidatorWithComponent(this.currentPaymentMethodInstance);
        } catch (err) {
            console.log(paymentMethod.type, err);
            return false;
        }

        return true;
    }

    renderStoredPaymentMethod(paymentMethod) {
        //  if the container doesn't exits don't try to render the component
        const paymentMethodContainer = $('[data-adyen-payment-method="' + adyenConfiguration.paymentMethodTypeHandlers["oneclick"] + '"]');

        // container doesn't exist, something went wrong on the template side
        if (!paymentMethodContainer) {
            return;
        }

        //Hide other payment method's contents when selecting an option
        $('[name=paymentMethodId]').on("change", function () {
            $('.adyen-payment-method-container-div').hide();
            $(`[data-adyen-payment-method-id="${$(this).val()}"]`).show();
        });

        /*Use the storedPaymentMethod object and the custom onChange function as the configuration object together*/
        const configuration = Object.assign(paymentMethod, {
            onChange: this.onStoredPaymentMethodChange.bind(this)
        });

        try {
            const paymentMethodInstance = this.adyenCheckout
                .create(paymentMethod.type, configuration);
            paymentMethodInstance.mount(
                paymentMethodContainer.find(`[data-adyen-stored-payment-method-id="${paymentMethod.id}"]`).get(0)
            );

            paymentMethodContainer.data('paymentMethodInstance', paymentMethodInstance);

            this.formValidator[adyenConfiguration.paymentMethodTypeHandlers.oneclick][paymentMethod.storedPaymentMethodId] = new FormValidatorWithComponent(paymentMethodInstance);
        } catch (err) {
            console.log(paymentMethod.type, err);
        }
    }

    hideStateData(method) {
        let element = $(`[data-adyen-payment-method=${adyenConfiguration.paymentMethodTypeHandlers[method]}]`);
        let selectedPaymentMethod = this.getPaymentMethodKeyByHandler(adyenCheckoutOptions.selectedPaymentMethodHandler);
        if (method === selectedPaymentMethod) {
            if (method == 'oneclick') {
                //The state data stored matches storedPaymentMethods, show update details button for oneclick
                $(`[data-adyen-payment-method=${adyenConfiguration.paymentMethodTypeHandlers["oneclick"]}]`).find('[data-adyen-payment-container]').hide();
                $(`[data-adyen-payment-method=${adyenConfiguration.paymentMethodTypeHandlers["oneclick"]}]`).find('[data-adyen-update-payment-details]').show();
            } else {
                //The state data stored matches this method, show update details button
                element.find('[data-adyen-payment-container]').hide();
                element.find('[data-adyen-update-payment-details]').show();
            }
        } else {
            //The state data stored does not match this method, show the form
            element.find('[data-adyen-payment-container]').show();
            element.find('[data-adyen-update-payment-details]').hide();
        }
    };

    /**
     * Reset card details
     */
    resetFields () {
        this.data = '';
    }

    onConfirmPaymentMethod (event) {
        debugger;
        let selectedPaymentMethod = this.getSelectedPaymentMethodHandlerIdentifyer();
        if (!(selectedPaymentMethod in this.formValidator)) {
            return true;
        }

        if (selectedPaymentMethod === adyenConfiguration.paymentMethodTypeHandlers.oneclick) {
            let selectedStoredPaymentMethodID = this.getSelectedStoredPaymentMethodID();
            if (!selectedStoredPaymentMethodID) {
                event.preventDefault();
                return;
            }

            $('#adyenStateData').val(JSON.stringify(
                this.storedPaymentMethodData[selectedStoredPaymentMethodID]
            ));

            if (!(selectedStoredPaymentMethodID in this.formValidator[selectedPaymentMethod])) {
                return;
            }

            if (!this.formValidator[selectedPaymentMethod][selectedStoredPaymentMethodID].validateForm()) {
                event.preventDefault();
            }

            return;
        }

        if (!this.formValidator[selectedPaymentMethod].validateForm()) {
            event.preventDefault();
        }
    }

    onPaymentComponentChange (state) {
        if (state.isValid) {
            this.data = state.data;
            $('#adyenStateData').val(JSON.stringify(this.data));
            $('#adyenOrigin').val(window.location.origin);
            this.placeOrderAllowed = true;
        } else {
            this.placeOrderAllowed = false;
            this.resetFields();
        }
    }

    onStoredPaymentMethodChange (state) {
        if (!state || !state.data || !state.data.paymentMethod) {
            return;
        }
        let storedPaymentMethodId = state.data.paymentMethod.storedPaymentMethodId;
        if (state.isValid) {
            this.storedPaymentMethodData[storedPaymentMethodId] = state.data;
            $('#adyenStateData').val(JSON.stringify(state.data));
            $('#adyenOrigin').val(window.location.origin);
            this.placeOrderAllowed = true;
        } else {
            this.placeOrderAllowed = false;
            this.storedPaymentMethodData[storedPaymentMethodId] = '';
        }
    }

    getSelectedPaymentMethodHandlerIdentifyer() {
        return $('[name=paymentMethodId]:checked').siblings('.adyen-payment-method-container-div').data('adyen-payment-method');
    }

    getPaymentMethodKeyByHandler(handler) {
        let map = adyenConfiguration.paymentMethodTypeHandlers;
        return Object.keys(map).find(key => map[key] === handler);
    }

    getSelectedStoredPaymentMethodID() {
        return $('[name=adyenStoredPaymentMethodId]:checked').val();
    }
}
