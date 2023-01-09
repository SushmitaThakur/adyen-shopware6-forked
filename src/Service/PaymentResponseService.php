<?php declare(strict_types=1);
/**
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
 * Adyen plugin for Shopware 6
 *
 * Copyright (c) 2020 Adyen B.V.
 * This file is open source and available under the MIT license.
 * See the LICENSE file for more info.
 *
 */

namespace Adyen\Shopware\Service;

use Adyen\Shopware\Entity\PaymentResponse\PaymentResponseEntity;
use Adyen\Shopware\Handlers\PaymentResponseHandler;
use Adyen\Shopware\Service\Repository\OrderTransactionRepository;
use Shopware\Core\Framework\Context;
use Shopware\Core\Framework\DataAbstractionLayer\EntityRepositoryInterface;
use Shopware\Core\Framework\DataAbstractionLayer\Search\Criteria;
use Shopware\Core\Framework\DataAbstractionLayer\Search\Filter\EqualsFilter;
use Shopware\Core\Framework\DataAbstractionLayer\Search\Sorting\FieldSorting;

class PaymentResponseService
{
    /**
     * @var EntityRepositoryInterface
     */
    private $repository;

    /**
     * @var OrderTransactionRepository
     */
    private $orderTransactionRepository;

    public function __construct(
        EntityRepositoryInterface $repository,
        OrderTransactionRepository $orderTransactionRepository
    ) {
        $this->repository = $repository;
        $this->orderTransactionRepository = $orderTransactionRepository;
    }

    public function getWithOrderNumber(string $orderNumber): ?PaymentResponseEntity
    {
        return $this->repository
            ->search(
                (new Criteria())
                    ->addFilter(new EqualsFilter('orderNumber', $orderNumber)),
                Context::createDefaultContext()
            )
            ->first();
    }

    public function getWithOrderId(string $orderId): ?PaymentResponseEntity
    {
        $orderTransaction = $this->orderTransactionRepository
            ->getFirstAdyenOrderTransaction($orderId);
        return $this->getWithOrderTransaction($orderTransaction->getId());
    }

    public function getWithOrderTransaction(string $orderTransactionId): ?PaymentResponseEntity
    {
        return $this->repository
            ->search(
                (new Criteria())
                    ->addFilter(new EqualsFilter('orderTransactionId', $orderTransactionId))
                    ->addAssociation('orderTransaction.order')
                    ->addSorting(new FieldSorting('createdAt', FieldSorting::DESCENDING)),
                Context::createDefaultContext()
            )
            ->first();
    }

    public function getWithPaymentReference(string $paymentReference): ?PaymentResponseEntity
    {
        return $this->repository
            ->search(
                (new Criteria())
                ->addFilter(new EqualsFilter('paymentReference', $paymentReference)),
                Context::createDefaultContext()
            )->first();
    }

    public function insertPaymentResponse(
        array $paymentResponse,
        string $value,
        string $identifier,
        bool $upsert = true
    ): void {
        if ($identifier === PaymentResponseHandler::ORDER_TRANSACTION_ID) {
            $storedPaymentResponse = $this->getWithOrderTransaction($value);
        } else {
            $storedPaymentResponse = $this->getWithPaymentReference($value);
        }

        if ($storedPaymentResponse && $upsert) {
            $fields['id'] = $storedPaymentResponse->getId();
        }

        $fields[$identifier] = $value;
        $fields['resultCode'] = $paymentResponse["resultCode"];
        $fields['response'] = json_encode($paymentResponse);

        $this->repository->upsert(
            [$fields],
            Context::createDefaultContext()
        );
    }
}
