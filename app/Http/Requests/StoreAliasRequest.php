<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreAliasRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'source' => 'required|email|max:255',
            'destination' => 'required|string', // Comma separated emails
            'active' => 'boolean',
        ];
    }
}
